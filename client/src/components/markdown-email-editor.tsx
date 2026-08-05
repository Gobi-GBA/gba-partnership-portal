import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Bold, Heading2, Italic, Link, List, ListOrdered, Quote } from "lucide-react";
import { renderMarkdownHtml } from "@shared/markdown";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface MarkdownEmailEditorHandle {
  insertText: (text: string) => void;
  focus: () => void;
}

interface MarkdownEmailEditorProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  testId: string;
  previewable?: boolean;
  className?: string;
  toolbarEnd?: ReactNode;
}

type SelectionUpdate = {
  value: string;
  start: number;
  end: number;
};

export function MarkdownPreview({
  markdown,
  className,
  testId,
}: {
  markdown: string;
  className?: string;
  testId?: string;
}) {
  const { t } = useLang();
  if (!markdown.trim()) {
    return (
      <p className={cn("py-8 text-center text-sm text-muted-foreground", className)} data-testid={testId}>
        {t("markdownPreviewEmpty")}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "prose prose-sm max-w-none text-foreground dark:prose-invert",
        "prose-headings:my-3 prose-headings:font-semibold prose-headings:tracking-normal",
        "prose-p:my-2 prose-p:leading-relaxed prose-li:my-0.5 prose-a:text-[hsl(193,52%,38%)]",
        "prose-blockquote:border-[hsl(var(--gold))] prose-blockquote:text-muted-foreground",
        "[&_a]:break-words [&_*]:tracking-normal",
        className,
      )}
      data-testid={testId}
      dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(markdown) }}
    />
  );
}

export const MarkdownEmailEditor = forwardRef<MarkdownEmailEditorHandle, MarkdownEmailEditorProps>(
  ({ value, onChange, rows = 10, testId, previewable = false, className, toolbarEnd }, forwardedRef) => {
    const { t } = useLang();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [mode, setMode] = useState<"write" | "preview">("write");

    const commit = ({ value: next, start, end }: SelectionUpdate) => {
      onChange(next);
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(start, end);
      });
    };

    const selection = () => {
      const textarea = textareaRef.current;
      return {
        start: textarea?.selectionStart ?? value.length,
        end: textarea?.selectionEnd ?? value.length,
      };
    };

    const replaceSelection = (replacement: string, selectStart = 0, selectLength = replacement.length) => {
      const { start, end } = selection();
      commit({
        value: `${value.slice(0, start)}${replacement}${value.slice(end)}`,
        start: start + selectStart,
        end: start + selectStart + selectLength,
      });
    };

    const wrapSelection = (before: string, after: string, fallback: string) => {
      const { start, end } = selection();
      const selected = value.slice(start, end);
      const hasOuterMarkers = start >= before.length
        && value.slice(start - before.length, start) === before
        && value.slice(end, end + after.length) === after;

      if (hasOuterMarkers) {
        commit({
          value: `${value.slice(0, start - before.length)}${selected}${value.slice(end + after.length)}`,
          start: start - before.length,
          end: end - before.length,
        });
        return;
      }

      const inner = selected || fallback;
      const replacement = `${before}${inner}${after}`;
      commit({
        value: `${value.slice(0, start)}${replacement}${value.slice(end)}`,
        start: start + before.length,
        end: start + before.length + inner.length,
      });
    };

    const prefixLines = (kind: "heading" | "bullet" | "ordered" | "quote") => {
      const { start, end } = selection();
      const lineStart = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
      const nextBreak = value.indexOf("\n", end);
      const lineEnd = nextBreak === -1 ? value.length : nextBreak;
      const block = value.slice(lineStart, lineEnd);
      const lines = block.split("\n");
      const matcher = kind === "heading" ? /^##\s/
        : kind === "bullet" ? /^-\s/
          : kind === "ordered" ? /^\d+\.\s/
            : /^>\s/;
      const allMarked = lines.every((line) => !line.trim() || matcher.test(line));
      let counter = 1;
      if (lines.length === 1 && lines[0] === "") {
        const prefix = kind === "heading" ? "## "
          : kind === "bullet" ? "- "
            : kind === "ordered" ? "1. "
              : "> ";
        commit({
          value: `${value.slice(0, lineStart)}${prefix}${value.slice(lineEnd)}`,
          start: lineStart + prefix.length,
          end: lineStart + prefix.length,
        });
        return;
      }
      const transformed = lines.map((line) => {
        if (!line.trim()) return line;
        if (allMarked) return line.replace(matcher, "");
        const prefix = kind === "heading" ? "## "
          : kind === "bullet" ? "- "
            : kind === "ordered" ? `${counter++}. `
              : "> ";
        return `${prefix}${line}`;
      }).join("\n");

      commit({
        value: `${value.slice(0, lineStart)}${transformed}${value.slice(lineEnd)}`,
        start: lineStart,
        end: lineStart + transformed.length,
      });
    };

    const insertLink = () => {
      const { start, end } = selection();
      const selected = value.slice(start, end) || t("markdownLinkText");
      const replacement = `[${selected}](https://)`;
      const urlStart = start + selected.length + 3;
      commit({
        value: `${value.slice(0, start)}${replacement}${value.slice(end)}`,
        start: urlStart + "https://".length,
        end: urlStart + "https://".length,
      });
    };

    useImperativeHandle(forwardedRef, () => ({
      insertText: (text: string) => replaceSelection(text),
      focus: () => textareaRef.current?.focus(),
    }));

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === "b") {
        event.preventDefault();
        wrapSelection("**", "**", t("markdownBoldText"));
      } else if (event.key.toLowerCase() === "i") {
        event.preventDefault();
        wrapSelection("*", "*", t("markdownItalicText"));
      }
    };

    const tools = [
      { key: "bold", label: t("markdownBold"), icon: Bold, action: () => wrapSelection("**", "**", t("markdownBoldText")) },
      { key: "italic", label: t("markdownItalic"), icon: Italic, action: () => wrapSelection("*", "*", t("markdownItalicText")) },
      { key: "heading", label: t("markdownHeading"), icon: Heading2, action: () => prefixLines("heading") },
      { key: "bullet", label: t("markdownBulletList"), icon: List, action: () => prefixLines("bullet") },
      { key: "ordered", label: t("markdownNumberedList"), icon: ListOrdered, action: () => prefixLines("ordered") },
      { key: "link", label: t("markdownLink"), icon: Link, action: insertLink },
      { key: "quote", label: t("markdownQuote"), icon: Quote, action: () => prefixLines("quote") },
    ];

    const editor = (
      <div className={cn("overflow-hidden rounded-md border border-input bg-background/60", className)}>
        <TooltipProvider delayDuration={250}>
          <div className="flex min-h-10 flex-wrap items-center gap-0.5 border-b border-border bg-muted/35 p-1">
            {tools.map(({ key, label, icon: Icon, action }) => (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label={label}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={action}
                    data-testid={`${testId}-${key}`}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            ))}
            {toolbarEnd && <div className="ml-auto flex items-center">{toolbarEnd}</div>}
          </div>
        </TooltipProvider>
        <Textarea
          ref={textareaRef}
          rows={rows}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          className="resize-y rounded-none border-0 bg-transparent font-mono text-sm leading-relaxed focus-visible:ring-0"
          data-testid={testId}
        />
      </div>
    );

    if (!previewable) return editor;

    return (
      <Tabs value={mode} onValueChange={(next) => setMode(next as "write" | "preview")}>
        <TabsList className="h-8 p-0.5">
          <TabsTrigger value="write" className="h-7 px-3 text-xs" data-testid={`${testId}-tab-write`}>
            {t("markdownWrite")}
          </TabsTrigger>
          <TabsTrigger value="preview" className="h-7 px-3 text-xs" data-testid={`${testId}-tab-preview`}>
            {t("markdownPreview")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="write" className="mt-2">{editor}</TabsContent>
        <TabsContent value="preview" className="mt-2 min-h-40 rounded-md border border-border bg-secondary/20 p-4">
          <MarkdownPreview markdown={value} testId={`${testId}-preview`} />
        </TabsContent>
      </Tabs>
    );
  },
);

MarkdownEmailEditor.displayName = "MarkdownEmailEditor";
