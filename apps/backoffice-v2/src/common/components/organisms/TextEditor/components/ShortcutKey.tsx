import * as React from 'react';
import { getShortcutKey } from '../utils';
import { ctw } from '@/common/utils/ctw/ctw';

export interface ShortcutKeyProps extends React.HTMLAttributes<HTMLSpanElement> {
  keys: string[];
}

export const ShortcutKey = React.forwardRef<HTMLSpanElement, ShortcutKeyProps>(
  ({ className, keys, ...props }, ref) => {
    const modifiedKeys = keys.map(key => getShortcutKey(key));
    const ariaLabel = modifiedKeys.map(shortcut => shortcut.readable).join(' + ');

    return (
      <span
        aria-label={ariaLabel}
        className={ctw('inline-flex items-center gap-0.5', className)}
        {...props}
        ref={ref}
      >
        {modifiedKeys.map(shortcut => (
          <kbd
            key={shortcut.symbol}
            className={ctw(
              'inline-block min-w-2.5 text-center align-baseline font-sans text-xs font-medium capitalize text-[rgb(156,157,160)]',

              className,
            )}
            {...props}
            ref={ref}
          >
            {shortcut.symbol}
          </kbd>
        ))}
      </span>
    );
  },
);

ShortcutKey.displayName = 'ShortcutKey';
