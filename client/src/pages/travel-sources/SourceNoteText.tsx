import { ChevronDown } from 'lucide-react';

function NoteLine({ text }: { text: string }) {
  const parts = text.split(/(#[^\s#]+)/u);
  const tagsOnly = text.includes('#') && text.replace(/#[^\s#]+/gu, '').trim() === '';

  if (tagsOnly) {
    return (
      <div className="flex flex-wrap gap-2 pt-2">
        {parts
          .filter((part) => part.startsWith('#'))
          .map((tag, index) => (
            <span key={index} className="bg-accent/10 rounded-full px-3 py-1 text-xs leading-5 text-accent">
              {tag}
            </span>
          ))}
      </div>
    );
  }

  const label = text.match(/^(店名[：:]|地址[：:]|营业时间[：:]|\d+月\d+日新增[：:])/u);
  return (
    <p className="break-words [overflow-wrap:anywhere]">
      {label ? (
        <>
          <strong className="font-semibold">{label[0]}</strong>
          {text.slice(label[0].length)}
        </>
      ) : (
        parts.map((part, index) =>
          part.startsWith('#') ? (
            <span key={index} className="text-accent">
              {part}
            </span>
          ) : (
            part
          )
        )
      )}
    </p>
  );
}

export default function SourceNoteText({ content }: { content: string }) {
  const paragraphs = content
    .replace(/\r\n?/g, '\n')
    .split(/\n[\t ]*\n+/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <details className="bg-surface-secondary/50 group mt-4 rounded-xl border border-edge">
      <summary className="cursor-pointer list-none rounded-xl px-4 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-content">原帖正文</span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-accent">
            <span className="group-open:hidden">展开阅读全文</span>
            <span className="hidden group-open:inline">收起正文</span>
            <ChevronDown aria-hidden="true" size={16} className="transition-transform group-open:rotate-180" />
          </span>
        </span>
        <span className="mt-2 line-clamp-2 text-sm leading-7 text-content-secondary group-open:hidden">{content}</span>
      </summary>
      <div className="px-4 pb-5 sm:px-5 sm:pb-6">
        <div className="max-w-[42rem] space-y-5 border-t border-edge pt-5 text-[15px] leading-[1.9] text-content sm:text-base sm:leading-[1.9]">
          {paragraphs.map((paragraph, index) => (
            <div key={index} className="space-y-2">
              {paragraph
                .split('\n')
                .map((line, lineIndex) => (line.trim() ? <NoteLine key={lineIndex} text={line.trim()} /> : null))}
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
