/**
 * The price test, said plainly: nothing is charged, the trip is generated either way,
 * and the answer only tells us whether a price would be acceptable.
 */
export default function PriceQuestion({ answer }: { answer: (choice: 'would_pay' | 'would_not_pay') => void }) {
  return (
    <section role="dialog" aria-labelledby="price-question" className="mt-6 rounded-xl border border-accent bg-surface-card p-5">
      <h2 id="price-question" className="text-lg font-semibold">想听听你的意见</h2>
      <p className="mt-2 text-sm text-content-secondary">
        这是你的第三份及以后的行程。我们在考虑以后从第三份起每份收 CHF 4.90。现在仍然免费，不会扣任何费用；无论你怎么选，行程都会照常生成。
      </p>
      <p className="mt-2 text-sm">如果收费，你还会用它生成这份行程吗？</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => answer('would_pay')} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text">会，值这个价</button>
        <button type="button" onClick={() => answer('would_not_pay')} className="rounded-lg border border-edge px-4 py-2 text-sm text-content-secondary">不会，只用免费的</button>
      </div>
    </section>
  )
}
