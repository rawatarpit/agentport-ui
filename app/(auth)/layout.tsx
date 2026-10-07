/**
 * Auth shell layout: no sidebar, no product chrome. Signing in is not using
 * the product — wrapping it in the dashboard nav pretends the visitor is
 * already inside, and a sidebar of locked routes next to a login form is
 * exactly the kind of thing that makes people distrust the rest.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center px-5 py-10">{children}</main>
      <footer className="border-t border-ink-line py-5 text-center">
        <p className="font-mono text-[11px] text-bone-faint">
          Agent Port — governed agent access for business.
        </p>
      </footer>
    </div>
  )
}
