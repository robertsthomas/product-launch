import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Product Launch Checklist</h1>
        <p className={styles.text}>
          Never forget a step when launching a new product again. We check every
          product against your launch checklist and auto-fix what we can.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Install App
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Automated Checks</strong>. Products are automatically
            scanned when created or updated to verify SEO, images, and more.
          </li>
          <li>
            <strong>One-Click Auto-Fix</strong>. Missing SEO titles? Alt text?
            Fix them instantly with a single click.
          </li>
          <li>
            <strong>Configurable Rules</strong>. Enable, disable, or adjust
            checklist rules to match your workflow.
          </li>
        </ul>
      </div>
    </div>
  );
}
