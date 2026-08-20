/**
 * Drives the App Bridge contextual save bar ("Unsaved changes" in the
 * admin top bar) for a form route, and — critically — guarantees it is
 * hidden BEFORE the route unmounts.
 *
 * Why this exists (App Store rejection 2.1.1, 2026-08-20): the host
 * admin only learns about save-bar state through a bubbling "update"
 * CustomEvent dispatched by the in-iframe `<ui-save-bar>` element. When
 * a Remix client-side navigation unmounts the route, React removes that
 * element from the DOM first; every hide that runs afterwards is
 * structurally too late:
 *
 *   - the element's own disconnectedCallback dispatches the event on a
 *     detached node, which cannot bubble to `document`, so the host is
 *     never told;
 *   - `shopify.saveBar.hide(id)` resolves the element via
 *     `getElementsByTagName("ui-save-bar")[id]` and THROWS
 *     "SaveBar with ID … not found" once it is gone.
 *
 * The host is then stuck with a zombie bar: Save/Discard proxy clicks
 * to detached buttons (dead), and while the bar is visible the admin
 * BLOCKS navigation. A Shopify reviewer hit exactly this after creating
 * a volume pricing rule (redirect back to the list) and could neither
 * dismiss the bar nor leave the page.
 *
 * The fix: hide the bar while the element is still mounted. Every Remix
 * navigation that will unmount this route (redirect after a successful
 * save, back arrow, breadcrumb, nav link, POP) passes through
 * `navigation.state === "loading"` with a DIFFERENT destination
 * pathname while the component is still mounted — that is the last
 * safe moment, so the hook hides the bar there.
 *
 * The destination-pathname check matters: a POST whose action returns
 * validation errors (json, no redirect) ALSO passes through "loading"
 * for the revalidation round-trip, but its destination is the current
 * location. Hiding then would flicker the bar on every failed save;
 * since same-pathname navigations never unmount the route, they are
 * excluded. (Adversarial-review find, 2026-08-20.)
 *
 * One path never renders "loading": a FETCHER action that THROWS swaps
 * in the error boundary with navigation still "idle". Callers whose
 * fetcher actions can throw while the form is dirty (e.g. Delete) must
 * hide the bar imperatively before submitting — deleting abandons
 * edits anyway. See the handleDelete callbacks in the $id routes.
 *
 * All show/hide promises get a `.catch` — after unmount App Bridge
 * rejects with "not found" (harmless once the host was told in time),
 * and an unhandled rejection would only add console noise.
 */
import { useEffect } from "react";
import { useLocation, useNavigation } from "@remix-run/react";
import { useAppBridge } from "@shopify/app-bridge-react";

export function useManagedSaveBar(id: string, isDirty: boolean) {
  const shopify = useAppBridge();
  const navigation = useNavigation();
  const location = useLocation();
  // "loading" toward ANOTHER pathname = this route is about to unmount.
  // The route is still mounted, the element is still in the DOM — hide
  // NOW or never. Same-pathname loading (post-action revalidation) and
  // "submitting" keep the bar visible.
  const leaving =
    navigation.state === "loading" &&
    navigation.location.pathname !== location.pathname;

  useEffect(() => {
    if (isDirty && !leaving) {
      shopify.saveBar.show(id).catch(() => {});
    } else {
      shopify.saveBar.hide(id).catch(() => {});
    }
    // Belt and braces: on unmount this usually rejects ("not found",
    // the element is already gone) — the real cleanup happened in the
    // `leaving` branch above while the element still existed.
    return () => {
      shopify.saveBar.hide(id).catch(() => {});
    };
  }, [id, isDirty, leaving, shopify]);
}
