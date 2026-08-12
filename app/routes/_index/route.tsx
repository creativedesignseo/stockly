import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

// App Store requirement 2.3.1: an app must not ask a merchant to type
// their myshopify.com domain during install or configuration. The Remix
// template ships this page with a "Shop domain" form and placeholder copy
// ("A short heading about [your app]"); both are common rejection causes,
// so this page is informational only and installs run through the App
// Store listing.
export default function App() {
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Stockly</h1>
        <p className={styles.text}>
          Wholesale pricing, buyer approvals and order minimums for your
          store. Install Stockly from the Shopify App Store, then open it
          from your Shopify admin.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Wholesale applications</strong>. Buyers apply through a
            form you design, and you approve or reject each one from a queue.
            Approved buyers are tagged automatically.
          </li>
          <li>
            <strong>Volume discounts</strong>. Set prices by quantity band,
            per product, per collection, or store-wide.
          </li>
          <li>
            <strong>Order minimums</strong>. Require a minimum first order
            before a buyer qualifies, and keep a recurring minimum after
            that. Both are enforced at checkout.
          </li>
        </ul>
        <p className={styles.text}>
          <a href="https://stocklygo.site">stocklygo.site</a>
        </p>
      </div>
    </div>
  );
}
