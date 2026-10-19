import Link from 'next/link'

/**
 * 404 in the console's own language, not Next's unstyled default — a
 * merchant who fat-fingers a URL must land somewhere that still looks
 * theirs and still tells them why they arrived here.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <p className="label">Not found</p>
        <h1 className="mt-2 font-display text-3xl text-bone">
          Nothing runs at this address
        </h1>
        <p className="prose-bone mt-3">
          The page you followed does not exist. Nothing was executed, nothing
          was written, and nothing is waiting on you — agent decisions live
          behind the console, not at broken URLs.
        </p>
      </div>
      <Link href="/" className="btn w-full sm:w-auto">
        Back to the overview
      </Link>
    </main>
  )
}
