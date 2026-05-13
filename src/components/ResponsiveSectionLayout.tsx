import { Button, SwipeableDrawer, Typography } from '@mui/material';
import { Rows3 } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';

export type ResponsiveSectionLayoutItem = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  ariaLabel?: string;
  active?: boolean;
  kind?: 'section' | 'action';
  onSelect: () => void;
};

type ResponsiveSectionLayoutProps = {
  items: ResponsiveSectionLayoutItem[];
  children: ReactNode;
  containerClassName?: string;
  contentClassName?: string;
  mobileMenuLabel?: ReactNode;
  mobileMenuTitle?: ReactNode;
};

function handleKeyboardSelect(event: KeyboardEvent<HTMLDivElement>, onSelect: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onSelect();
  }
}

function buildItemClassName(active: boolean) {
  return [
    'cursor-pointer px-4 py-3 transition-colors',
    'hover:bg-gray-100 dark:hover:bg-gray-800',
    active ? 'bg-gray-100 dark:bg-gray-800' : '',
  ].join(' ').trim();
}

export default function ResponsiveSectionLayout({
  items,
  children,
  containerClassName,
  contentClassName,
  mobileMenuLabel = 'Sections',
  mobileMenuTitle = 'Sections',
}: ResponsiveSectionLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const sectionItems = useMemo(
    () => items.filter((item) => (item.kind ?? 'section') === 'section'),
    [items],
  );
  const actionItems = useMemo(
    () => items.filter((item) => item.kind === 'action'),
    [items],
  );
  const currentItem = sectionItems.find((item) => item.active) ?? sectionItems[0] ?? items[0] ?? null;
  const showMobileMenuButton = sectionItems.length > 1 || actionItems.length > 0;

  const handleSelect = (item: ResponsiveSectionLayoutItem) => {
    item.onSelect();
    setMobileMenuOpen(false);
  };

  return (
    <>
      <div
        className={[
          'absolute top-[65px] right-0 bottom-0 left-0 flex h-[calc(100vh-65px)] min-h-0 flex-col justify-start text-left md:flex-row',
          containerClassName ?? '',
        ].join(' ').trim()}
      >
        <div className="hidden min-h-0 min-w-[300px] max-w-[400px] shrink-0 border-r border-b border-gray-200 text-left dark:border-gray-800 md:flex md:flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {sectionItems.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                aria-current={item.active ? 'page' : undefined}
                aria-label={item.ariaLabel}
                className={buildItemClassName(Boolean(item.active))}
                onClick={() => item.onSelect()}
                onKeyDown={(event) => handleKeyboardSelect(event, item.onSelect)}
              >
                <div className="flex flex-col gap-2">
                  <div className="text-lg">{item.title}</div>
                  {item.description && (
                    <Typography variant="body2" color="text.secondary">
                      {item.description}
                    </Typography>
                  )}
                </div>
              </div>
            ))}
            {actionItems.length > 0 && (
              <div className="border-t border-gray-200 dark:border-gray-800">
                {actionItems.map((item) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    aria-label={item.ariaLabel}
                    className={buildItemClassName(false)}
                    onClick={() => item.onSelect()}
                    onKeyDown={(event) => handleKeyboardSelect(event, item.onSelect)}
                  >
                    <div className="flex flex-col gap-2">
                      <div className="text-lg">{item.title}</div>
                      {item.description && (
                        <Typography variant="body2" color="text.secondary">
                          {item.description}
                        </Typography>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {currentItem && (
          <div className="shrink-0 border-b border-gray-200 px-4 py-3 dark:border-gray-800 md:hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 0.75, fontSize: 12, letterSpacing: '0.08em' }}
                >
                  {mobileMenuTitle}
                </Typography>
                <div className="text-lg font-semibold leading-6">{currentItem.title}</div>
                {currentItem.description && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      mt: 0.5,
                      display: '-webkit-box',
                      overflow: 'hidden',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 2,
                    }}
                  >
                    {currentItem.description}
                  </Typography>
                )}
              </div>
              {showMobileMenuButton && (
                <Button
                  variant="text"
                  size="small"
                  startIcon={<Rows3 size={16} />}
                  onClick={() => setMobileMenuOpen(true)}
                  sx={{
                    flexShrink: 0,
                    minWidth: 'auto',
                    px: 0.5,
                    borderRadius: 0,
                  }}
                >
                  {mobileMenuLabel}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className={contentClassName ?? 'min-h-0 flex-1 overflow-y-auto p-4'}>
          {children}
        </div>
      </div>

      <SwipeableDrawer
        anchor="bottom"
        open={mobileMenuOpen}
        disableSwipeToOpen
        onOpen={() => {}}
        onClose={() => setMobileMenuOpen(false)}
        sx={{
          '& .MuiDrawer-paper': {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          },
        }}
      >
        <div className="mx-auto w-full max-w-xl px-4 pb-2 pt-3">
          <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-gray-300 dark:bg-gray-700" />
          <Typography variant="h6" sx={{ mb: 2 }}>
            {mobileMenuTitle}
          </Typography>

          <div className="flex flex-col">
            {sectionItems.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                aria-current={item.active ? 'page' : undefined}
                aria-label={item.ariaLabel}
                className={[
                  'border-b border-gray-200 px-0 py-3 transition-colors dark:border-gray-800',
                  item.active ? 'text-inherit' : 'hover:bg-gray-100 dark:hover:bg-gray-800',
                ].join(' ')}
                onClick={() => handleSelect(item)}
                onKeyDown={(event) => handleKeyboardSelect(event, () => handleSelect(item))}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-medium">{item.title}</div>
                    {item.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {item.description}
                      </Typography>
                    )}
                  </div>
                  {item.active && (
                    <Typography variant="body2" color="primary" sx={{ flexShrink: 0, fontWeight: 700 }}>
                      Current
                    </Typography>
                  )}
                </div>
              </div>
            ))}
          </div>

          {actionItems.length > 0 && (
            <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Actions
              </Typography>
              <div className="flex flex-col">
                {actionItems.map((item) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    aria-label={item.ariaLabel}
                    className="border-b border-gray-200 px-0 py-3 transition-colors hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-gray-800"
                    onClick={() => handleSelect(item)}
                    onKeyDown={(event) => handleKeyboardSelect(event, () => handleSelect(item))}
                  >
                    <div className="flex flex-col gap-1.5">
                      <div className="text-base font-medium">{item.title}</div>
                      {item.description && (
                        <Typography variant="body2" color="text.secondary">
                          {item.description}
                        </Typography>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SwipeableDrawer>
    </>
  );
}
