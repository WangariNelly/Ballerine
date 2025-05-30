import { ctw } from '@/common/utils/ctw';
import { Popover, PopoverContent, PopoverTrigger, ScrollArea } from '@/components/atoms';
import { Command, CommandGroup, CommandInput, CommandItem } from '@/components/atoms/Command';
import { UnselectButtonProps } from '@/components/molecules/inputs/MultiSelect/components/Chip/UnselectButton';
import { SelectedElementParams } from '@/components/molecules/inputs/MultiSelect/types';
import { ClickAwayListener } from '@mui/material';
import keyBy from 'lodash/keyBy';
import { FocusEvent, FocusEventHandler, useCallback, useMemo, useRef, useState } from 'react';

export type MultiSelectValue = string | number;

export interface MultiSelectOption {
  title: string;
  value: MultiSelectValue;
}

export type MultiSelectSelectedItemRenderer = (
  params: SelectedElementParams,
  option: MultiSelectOption,
) => JSX.Element;

export interface MultiSelectProps {
  name?: string;
  value?: MultiSelectValue[];
  options: MultiSelectOption[];
  searchPlaceholder?: string;
  disabled?: boolean;
  testId?: string;
  textInputClassName?: string;
  renderSelected: MultiSelectSelectedItemRenderer;
  onChange: (selected: MultiSelectValue[], inputName: string) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
}

export const MultiSelect = ({
  name,
  value,
  options,
  searchPlaceholder = 'Select more...',
  disabled,
  testId,
  textInputClassName,
  renderSelected,
  onChange,
  onBlur,
  onFocus,
}: MultiSelectProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => {
    if (!value) {
      return [];
    }

    const optionsMap = keyBy(options, 'value');

    return value.map(value => optionsMap[value]);
  }, [value, options]);

  const [inputValue, setInputValue] = useState('');

  const handleSelect = useCallback(
    (option: MultiSelectOption) => {
      setInputValue('');
      onChange(
        value ? [...value, option.value] : [option.value],
        // @ts-ignore
        name,
      );
    },
    [value, name, onChange],
  );

  const handleUnselect = useCallback(
    (option: MultiSelectOption) => {
      onChange(
        selected
          .filter(selectedOption => selectedOption?.value !== option.value)
          // @ts-ignore
          .map(option => option.value),
        // @ts-ignore
        name,
      );
    },
    [selected, name, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const input = inputRef.current;

      if (input) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (input.value === '') {
            selected.pop();
            onChange(
              // @ts-ignore
              selected.map(option => option?.value),
              // @ts-ignore
              name,
            );
          }
        }

        // This is not a default behaviour of the <input /> field
        if (e.key === 'Escape') {
          input.blur();
        }
      }
    },
    [selected, name, onChange],
  );

  const selectables = useMemo(() => {
    const selectedMap = keyBy(selected, 'value');

    return options
      .filter(option => !selectedMap[option.value as Exclude<PropertyKey, symbol>])
      .filter(option =>
        inputValue
          ? option.title?.toLocaleLowerCase().includes(inputValue.toLocaleLowerCase())
          : true,
      );
  }, [options, selected, inputValue]);

  const handleOutsidePopupClick = useCallback(() => {
    if (open) {
      setOpen(false);
    }
  }, [open]);

  const buildUnselectButtonProps = useCallback(
    (option: MultiSelectOption) => {
      const props: Omit<UnselectButtonProps, 'icon' | 'className'> = {
        onKeyDown: e => {
          if (e.key === 'Enter') {
            handleUnselect(option);
          }
        },
        onMouseDown: e => {
          e.preventDefault();
          e.stopPropagation();
        },
        onClick: () => handleUnselect(option),
      };

      return props;
    },
    [handleUnselect],
  );

  return (
    <Popover open={open}>
      <ClickAwayListener onClickAway={handleOutsidePopupClick}>
        <Command onKeyDown={handleKeyDown} className="overflow-visible">
          <PopoverTrigger asChild>
            <div
              className={ctw(
                'border-input ring-offset-background focus-within:ring-ring min-10 group flex items-center rounded-md border py-2 text-sm focus-within:ring-1 focus-within:ring-offset-1',
                { 'pointer-events-none opacity-50': disabled },
              )}
            >
              <div
                className="flex flex-wrap gap-2 px-2"
                tabIndex={0}
                onFocus={onFocus as FocusEventHandler<HTMLDivElement>}
                onBlur={onBlur as FocusEventHandler<HTMLDivElement>}
              >
                {selected.map(option => {
                  return renderSelected(
                    {
                      // @ts-ignore
                      unselectButtonProps: buildUnselectButtonProps(option),
                    },
                    // @ts-ignore
                    option,
                  );
                })}
                <CommandInput
                  ref={inputRef}
                  value={inputValue}
                  onValueChange={setInputValue}
                  placeholder={searchPlaceholder}
                  style={{ border: 'none' }}
                  className={ctw('placeholder:text-muted-foreground h-6', textInputClassName)}
                  onFocus={event => {
                    setOpen(true);
                    onFocus?.(event);
                  }}
                  onBlur={onBlur}
                  data-testid={testId ? `${testId}-search-input` : undefined}
                />
              </div>
            </div>
          </PopoverTrigger>

          <PopoverContent style={{ width: 'var(--radix-popover-trigger-width)' }}>
            {selectables.length ? (
              <ScrollArea orientation="both" className="h-[200px]">
                <CommandGroup className="h-full p-0">
                  {selectables.map(option => {
                    return (
                      <CommandItem
                        key={option.value}
                        onMouseDown={e => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onSelect={() => handleSelect(option)}
                        className={'cursor-pointer'}
                        data-testid={testId ? `${testId}-option` : undefined}
                      >
                        {option.title}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </ScrollArea>
            ) : (
              <p className="text-muted-foreground text-center text-xs">
                Options not found or already selected.
              </p>
            )}
          </PopoverContent>
        </Command>
      </ClickAwayListener>
    </Popover>
  );
};
