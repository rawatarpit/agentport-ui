import { StorefrontChat } from '@/components/chat'

export const metadata = {
  title: 'Storefront chat — Agent Port',
  description:
    'A customer talks to an assistant that is subject to the same policy as every other agent: reads answer, writes are held for a human, and forbidden actions are refused with a reason.',
}

export default function ChatPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="label">Governed conversion</p>
        <h2 className="mt-2 font-display text-3xl text-bone">The conversation a brand controls</h2>
        <p className="prose-bone mt-3 max-w-[68ch]">
          Discovery may happen on someone else&rsquo;s surface. The conversation and
          the customer record happen here. That only works if the assistant on this
          surface is held to the same policy as an agent arriving cold from a search
          engine.
        </p>
      </div>
      <StorefrontChat />
    </div>
  )
}
