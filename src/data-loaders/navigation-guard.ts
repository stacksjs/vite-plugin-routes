import type { App, EffectScope, InjectionKey, ShallowRef } from 'vue'
import type {
  NavigationGuard,
  NavigationGuardReturn,
  RouteLocationNormalizedLoaded,
  Router,
} from 'vue-router'
import type { _Awaitable } from '../utils'
import type { UseDataLoader } from './createDataLoader'
import {

  effectScope,

  inject,

  shallowRef,

} from 'vue'
import { isNavigationFailure } from 'vue-router'
import { toLazyValue } from './createDataLoader'
import {
  ABORT_CONTROLLER_KEY,
  APP_KEY,
  IS_SSR_KEY,
  LOADER_ENTRIES_KEY,
  LOADER_SET_KEY,
  NAVIGATION_RESULTS_KEY,
  PENDING_LOCATION_KEY,
} from './meta-extensions'
import { assign, isDataLoader, setCurrentContext } from './utils'

/**
 * Key to inject the global loading state for loaders used in `useIsDataLoading`.
 * @internal
 */
export const IS_DATA_LOADING_KEY = Symbol() as InjectionKey<
  ShallowRef<boolean>
>

/**
 * Possible values to change the result of a navigation within a loader. Can be returned from a data loader and will
 * appear in `selectNavigationResult`. If thrown, it will immediately cancel the navigation. It can only contain values
 * that cancel the navigation.
 *
 * @example
 * ```ts
 * export const useUserData = defineLoader(async (to) => {
 *   const user = await fetchUser(to.params.id)
 *   if (!user) {
 *     return new NavigationResult('/404')
 *   }
 *   return user
 * })
 * ```
 */
export class NavigationResult {
  constructor(public readonly value: _DataLoaderRedirectResult) {}
}

/**
 * TODO: export functions that allow preloading outside of a navigation guard
 */

/**
 * Setups the different Navigation Guards to collect the data loaders from the route records and then to execute them.
 * @internal
 * @see {@link DataLoaderPlugin}
 *
 * @param {object} router - The router configuration object
 * @param {Router} router.router - the router instance
 * @param {App} router.app - the Vue app instance
 * @param {EffectScope} router.effect - the effect scope
 * @param {boolean} router.isSSR - whether the app is running in SSR mode
 * @param {Array|Function} router.errors - list of expected errors that shouldn't abort navigation
 * @param {Function} router.selectNavigationResult - function to select navigation result from multiple results
 * @returns A function to remove all guards and cleanup
 */
// eslint-disable-next-line pickier/no-unused-vars
export function setupLoaderGuard({
  router,
  app,
  effect: scope,
  isSSR,
  errors: globalErrors = [],
  selectNavigationResult = results => results[0]!.value,
}: SetupLoaderGuardOptions) {
  // avoid creating the guards multiple times
  if (router[LOADER_ENTRIES_KEY] != null) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[vue-router]: Data Loader was setup twice. Make sure to setup only once.',
      )
    }
    return () => {}
  }

  // explicit dev to avoid warnings in tests
  if (process.env.NODE_ENV === 'development' && !isSSR) {
    console.warn(
      '[vue-router]: Data Loader is experimental and subject to breaking changes in the future.',
    )
  }

  // Access to the entries map for convenience
  router[LOADER_ENTRIES_KEY] = new WeakMap()

  // Access to `app.runWithContext()`
  router[APP_KEY] = app

  router[IS_SSR_KEY] = !!isSSR

  // global loading state for loaders used in `useIsDataLoading`
  const isDataLoading = scope.run(() => shallowRef(false))!
  app.provide(IS_DATA_LOADING_KEY, isDataLoading)

  // guard to add the loaders to the meta property
  const removeLoaderGuard = router.beforeEach((to) => {
    // Abort any pending navigation. For cancelled navigations, this will happen before the `router.afterEach()`
    if (router[PENDING_LOCATION_KEY]) {
      // we could craft a navigation failure here but vue-router doesn't expose createRouterError() (yet?) and we don't
      // seem to actually need a reason within loaders
      router[PENDING_LOCATION_KEY].meta[ABORT_CONTROLLER_KEY]?.abort()
    }

    // global pending location, used by nested loaders to know if they should load or not
    router[PENDING_LOCATION_KEY] = to
    // Differently from records, this one is reset on each navigation
    // so it must be built each time
    to.meta[LOADER_SET_KEY] = new Set()
    // adds an abort controller that can pass a signal to loaders
    to.meta[ABORT_CONTROLLER_KEY] = new AbortController()
    // allow loaders to add navigation results
    to.meta[NAVIGATION_RESULTS_KEY] = []

    // Collect all the lazy loaded components to await them in parallel
    const lazyLoadingPromises: Promise<unknown>[] = []

    for (const record of to.matched) {
      // we only need to do this once per record as these changes are preserved
      // by the router
      if (!record.meta[LOADER_SET_KEY]) {
        // setup an empty array to skip the check next time
        record.meta[LOADER_SET_KEY] = new Set(record.meta.loaders || [])

        // add all the loaders from the components to the set
        for (const componentName in record.components) {
          const component: unknown = record.components[componentName]

          // we only add async modules because otherwise the component doesn't have any loaders and the user should add
          // them with the `loaders` array
          const promise = (
            isAsyncModule(component)
              ? component()
              : Promise.resolve(
                  component as Record<string, unknown> | (() => unknown),
                )
          ).then((viewModule) => {
            // avoid checking functional components
            if (typeof viewModule === 'function')
              return

            for (const exportName in viewModule) {
              const exportValue = viewModule[exportName]

              if (isDataLoader(exportValue)) {
                record.meta[LOADER_SET_KEY]!.add(exportValue)
              }
            }
            // TODO: remove once nuxt doesn't wrap with `e => e.default` async pages
            if (Array.isArray(viewModule.__loaders)) {
              for (const loader of viewModule.__loaders) {
                if (isDataLoader(loader)) {
                  record.meta[LOADER_SET_KEY]!.add(loader)
                }
              }
            }
          })

          lazyLoadingPromises.push(promise)
        }
      }
    }

    return Promise.all(lazyLoadingPromises).then(() => {
      // group all the loaders in a single set
      for (const record of to.matched) {
        // merge the whole set of loaders
        for (const loader of record.meta[LOADER_SET_KEY]!) {
          to.meta[LOADER_SET_KEY]!.add(loader)
        }
      }
      // we return nothing to remove the value to allow the navigation
      // same as return true
    })
  })

  const removeDataLoaderGuard = router.beforeResolve((to, from) => {
    // if we reach this guard, all properties have been set
    const loaders = Array.from(to.meta[LOADER_SET_KEY]!) as UseDataLoader[]

    // TODO: could we benefit anywhere here from verifying the signal is aborted and not call the loaders at all
    // if (to.meta[ABORT_CONTROLLER_KEY]!.signal.aborted) {
    //   return to.meta[ABORT_CONTROLLER_KEY]!.signal.reason ?? false
    // }

    // unset the context so all loaders are executed as root loaders
    setCurrentContext([])

    isDataLoading.value = true

    return Promise.all(
      loaders.map((loader) => {
        const { server, lazy, errors } = loader._.options
        // do not run on the server if specified
        if (!server && isSSR) {
          return undefined
        }
        // keep track of loaders that should be committed after all loaders are done
        const ret = scope.run(() =>
          app
            // allows inject and provide APIs
            .runWithContext(() =>
              loader._.load(to as RouteLocationNormalizedLoaded, router, from),
            ),
        )!

        // on client-side, lazy loaders are not awaited, but on server they are
        // we already checked for the `server` option above
        return !isSSR && toLazyValue(lazy, to, from)
          ? undefined
          : ret.catch((reason) => {
              // errors: false, always abort the navigation
              if (!errors)
                throw reason

              // errors: true, accept globally defined errors
              if (errors === true) {
                // is the error a globally expected error
                if (
                  Array.isArray(globalErrors)
                    ? globalErrors.some(Err => reason instanceof Err)
                    : globalErrors(reason)
                ) {
                  return
                }
              }
              else if (
                // use local error option if it exists first and then the global one
                Array.isArray(errors)
                  ? errors.some(Err => reason instanceof Err)
                  : errors(reason)
              ) {
                return
              }
              // by default, the error is not handled
              throw reason
            })
      }),
    ) // let the navigation go through by returning true or void
      .then(() => {
        // console.log(
        //   `✨ Navigation results "${to.fullPath}": [${to.meta[
        //     NAVIGATION_RESULTS_KEY
        //   ]!.map((r) => JSON.stringify(r.value)).join(', ')}]`
        // )
        if (to.meta[NAVIGATION_RESULTS_KEY]!.length) {
          return selectNavigationResult(to.meta[NAVIGATION_RESULTS_KEY]!)
        }
      })
      .catch(error =>
        error instanceof NavigationResult ? error.value : Promise.reject<never>(error),
      )
      .finally(() => {
        // unset the context so mounting happens without an active context
        // and loaders do not believe they are being called as nested when they are not
        setCurrentContext([])
        isDataLoading.value = false
      })
  })

  // listen to duplicated navigation failures to reset the pendingTo and pendingLoad
  // since they won't trigger the beforeEach or beforeResolve defined above
  const removeAfterEach = router.afterEach((to, from, failure) => {
    // console.log(
    //   `🔚 afterEach "${_from.fullPath}" -> "${to.fullPath}": ${failure?.message}`
    // )
    if (failure) {
      // abort the signal of a failed navigation
      // we need to check if it exists because the navigation guard that creates
      // the abort controller could not be triggered depending on the failure
      to.meta[ABORT_CONTROLLER_KEY]?.abort(failure)

      if (
        // NOTE: using a smaller version to cutoff some bytes
        isNavigationFailure(failure, 16 /* NavigationFailureType.duplicated */)
      ) {
        for (const loader of to.meta[LOADER_SET_KEY]!) {
          const entry = loader._.getEntry(router as Router)
          entry.resetPending()
        }
      }
    }
    else {
      for (const loader of to.meta[LOADER_SET_KEY]!) {
        const { commit, lazy } = loader._.options
        if (commit === 'after-load') {
          const entry = loader._.getEntry(router as Router)
          // lazy loaders do not block the navigation so the navigation guard
          // might call commit before the loader is ready
          // on the server, entries might not even exist
          if (
            entry
            && (!toLazyValue(lazy, to, from) || !entry.isLoading.value)
          ) {
            entry.commit(to as RouteLocationNormalizedLoaded)
          }
        }
      }
    }

    // avoid this navigation being considered valid by the loaders
    if (router[PENDING_LOCATION_KEY] === to) {
      router[PENDING_LOCATION_KEY] = null
    }
  })

  // abort the signal on thrown errors
  const removeOnError = router.onError((error, to) => {
    // same as with afterEach, we check if it exists because the navigation guard
    // that creates the abort controller could not be triggered depending on the error
    to.meta[ABORT_CONTROLLER_KEY]?.abort(error)
    // avoid this navigation being considered valid by the loaders
    if (router[PENDING_LOCATION_KEY] === to) {
      router[PENDING_LOCATION_KEY] = null
    }
  })

  return () => {
    // @ts-expect-error: must be there in practice
    delete router[LOADER_ENTRIES_KEY]
    // @ts-expect-error: must be there in practice
    delete router[APP_KEY]
    removeLoaderGuard()
    removeDataLoaderGuard()
    removeAfterEach()
    removeOnError()
  }
}

/**
 * Allows differentiating lazy components from functional components and vue-class-component
 * @internal
 *
 * @param asyncMod - the component to check
 */
export function isAsyncModule(
  asyncMod: unknown,
): asyncMod is () => Promise<Record<string, unknown>> {
  return (
    typeof asyncMod === 'function'
    // vue functional components
    && !('displayName' in asyncMod)
    && !('props' in asyncMod)
    && !('emits' in asyncMod)
    && !('__vccOpts' in asyncMod)
  )
}

/**
 * Options to initialize the data loader guard.
 */
export interface SetupLoaderGuardOptions extends DataLoaderPluginOptions {
  /**
   * The Vue app instance. Used to access the `provide` and `inject` APIs.
   */
  app: App<unknown>

  /**
   * The effect scope to use for the data loaders.
   */
  effect: EffectScope
}

/**
 * Possible values to change the result of a navigation within a loader
 * @internal
 */
export type _DataLoaderRedirectResult = Exclude<
  ReturnType<NavigationGuard>,
  // only preserve values that cancel the navigation
  // eslint-disable-next-line pickier/no-unused-vars
  Promise<unknown> | ((...args: any[]) => any) | true | void | undefined
>

/**
 * Data Loader plugin to add data loading support to Vue Router.
 *
 * @example
 * ```ts
 * const router = createRouter({
 *   routes,
 *   history: createWebHistory(),
 * })
 *
 * const app = createApp({})
 * app.use(DataLoaderPlugin, { router })
 * app.use(router)
 * ```
 */
export function DataLoaderPlugin(app: App, options: DataLoaderPluginOptions) {
  const effect = effectScope(true)
  const removeGuards = setupLoaderGuard(assign({ app, effect }, options))

  // TODO: use https://github.com/vuejs/core/pull/8801 if merged
  const { unmount } = app
  app.unmount = () => {
    effect.stop()
    removeGuards()
    unmount.call(app)
  }
}

/**
 * Options passed to the DataLoaderPlugin.
 */
export interface DataLoaderPluginOptions {
  /**
   * The router instance. Adds the guards to it
   */
  router: Router

  isSSR?: boolean

  /**
   * Called if any data loader returns a `NavigationResult` with an array of them. Should decide what is the outcome of
   * the data fetching guard. Note this isn't called if no data loaders return a `NavigationResult` or if an error is thrown.
   * @defaultValue `(results) => results[0].value`
   */
  selectNavigationResult?: (
    results: NavigationResult[],
  ) => _Awaitable<Exclude<NavigationGuardReturn, ((...args: any[]) => any) | Promise<unknown>>>

  /**
   * List of _expected_ errors that shouldn't abort the navigation (for non-lazy loaders). Provide a list of
   * constructors that can be checked with `instanceof` or a custom function that returns `true` for expected errors.
   */
  errors?: Array<new (...args: any) => any> | ((reason?: unknown) => boolean)
}

/**
 * Return a ref that reflects the global loading state of all loaders within a navigation.
 * This state doesn't update if `refresh()` is manually called.
 */
export function useIsDataLoading() {
  return inject(IS_DATA_LOADING_KEY)!
}
