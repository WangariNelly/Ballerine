import React, {
  ComponentProps,
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Cell,
  ColumnDef,
  ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  OnChangeFn,
  RowData,
  RowSelectionState,
  SortingState,
  TableOptions,
  useReactTable,
} from '@tanstack/react-table';
import {
  Collapsible,
  CollapsibleContent as ShadCNCollapsibleContent,
  ScrollArea,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components';
import { DefaultTableCell } from '@/components/atoms/DefaultTableCell';
import { ctw, FunctionComponentWithChildren } from '@/common';
import { isInstanceOfFunction, SortDirection } from '@ballerine/common';
import { checkIsBooleanishRecord } from '@/common/utils/check-is-booleanish-record/check-is-booleanish-record';
import { ChevronDown } from 'lucide-react';

export interface IDataTableProps<TData, TValue = any> {
  data: TData[];
  columns: Array<ColumnDef<TData, TValue>>;
  caption?: ComponentProps<typeof TableCaption>['children'];

  CellContentWrapper?: FunctionComponentWithChildren<{ cell: Cell<TData, TValue> }>;
  CollapsibleContent?: FunctionComponent<{ row: TData }>;

  // Component props
  props?: {
    scroll?: Partial<ComponentProps<typeof ScrollArea>>;
    table?: ComponentProps<typeof Table>;
    header?: ComponentProps<typeof TableHeader>;
    head?: ComponentProps<typeof TableHead>;
    row?: ComponentProps<typeof TableRow>;
    body?: ComponentProps<typeof TableBody>;
    cell?: ComponentProps<typeof TableCell>;
    noDataCell?: ComponentProps<typeof TableCell>;
    caption?: ComponentProps<typeof TableCaption>;
  };

  // react-table options
  options?: Omit<TableOptions<TData>, 'getCoreRowModel' | 'data' | 'columns'>;

  sort: {
    onSort: (params: { sortBy: string; sortDir: SortDirection }) => void;
    sortDir: SortDirection;
    sortBy: string;
  };

  select: {
    onSelect: (ids: Record<string, boolean>) => void;
    selected: Record<string, boolean>;
  };

  scrollRef?: React.RefObject<HTMLDivElement>;
  handleScroll?: (event: React.UIEvent<HTMLDivElement>) => void;
}

const DataTableBase = <TData extends RowData, TValue = any>(
  {
    data,
    props,
    caption,
    columns,
    CellContentWrapper,
    options = {},
    CollapsibleContent,
    sort,
    select,
    handleScroll,
  }: IDataTableProps<TData, TValue>,
  ref: React.ForwardedRef<HTMLDivElement>,
) => {
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const { enableSorting = false } = options;
  const [sorting, setSorting] = useState<SortingState>([
    {
      id: sort?.sortBy || options?.initialState?.sorting?.[0]?.id || 'id',
      desc: sort?.sortDir === 'desc' || options?.initialState?.sorting?.[0]?.desc || false,
    },
  ]);

  const onSortingChange: OnChangeFn<SortingState> = useCallback(
    sortingUpdaterOrValue => {
      setSorting(prevSortingState => {
        if (!isInstanceOfFunction(sortingUpdaterOrValue)) {
          sort?.onSort({
            sortBy: (sortingUpdaterOrValue as SortingState)[0]?.id || sort?.sortBy,
            sortDir: (sortingUpdaterOrValue as SortingState)[0]?.desc ? 'desc' : 'asc',
          });

          return sortingUpdaterOrValue;
        }

        const newSortingState = (
          sortingUpdaterOrValue as Extract<
            Parameters<OnChangeFn<SortingState>>[0],
            (args: any) => any
          >
        )(prevSortingState);

        sort?.onSort({
          sortBy: newSortingState[0]?.id?.replace(/_/g, '.') || sort?.sortBy,
          sortDir: newSortingState[0]?.desc ? 'desc' : 'asc',
        });

        return newSortingState;
      });
    },
    [sort?.onSort, sort?.sortBy],
  );

  const { selected: ids, onSelect } = select;
  const [rowSelection, setRowSelection] = useState<RowSelectionState>(
    checkIsBooleanishRecord(ids) ? ids : {},
  );

  const onRowSelectionChange: OnChangeFn<RowSelectionState> = useCallback(
    selectionUpdaterOrValue => {
      setRowSelection(prevSelectionState => {
        if (!isInstanceOfFunction(selectionUpdaterOrValue)) {
          onSelect(selectionUpdaterOrValue);

          return selectionUpdaterOrValue;
        }

        const newSelectionState = (
          selectionUpdaterOrValue as Extract<
            Parameters<OnChangeFn<RowSelectionState>>[0],
            (args: any) => any
          >
        )(prevSelectionState);

        onSelect(newSelectionState);

        return newSelectionState;
      });
    },
    [onSelect],
  );

  useEffect(() => {
    if (Object.keys(ids ?? {}).length > 0) return;

    setRowSelection({});
  }, [ids]);

  const state = useMemo(
    () => ({
      rowSelection,
      ...(enableSorting && {
        sorting,
      }),
      ...(CollapsibleContent && {
        expanded,
      }),
    }),
    [CollapsibleContent, enableSorting, expanded, rowSelection, sorting],
  );

  const table = useReactTable<TData>({
    state,
    ...options,
    data: data ?? [],
    columns: columns ?? [],
    onRowSelectionChange,
    enableRowSelection: true,
    getRowId: row => (row as TData & { id: string }).id,
    getCoreRowModel: getCoreRowModel(),
    defaultColumn: {
      cell: DefaultTableCell,
    },
    ...(enableSorting && {
      enableSorting,
      onSortingChange,
      manualSorting: true,
      sortDescFirst: true,
      enableSortingRemoval: false,
      getSortedRowModel: getSortedRowModel(),
    }),
    ...(CollapsibleContent
      ? {
          onExpandedChange: setExpanded,
          getExpandedRowModel: getExpandedRowModel(),
        }
      : {}),
  });

  return (
    <div className="relative overflow-auto rounded-md border bg-white shadow">
      <ScrollArea orientation="both" {...props?.scroll} onScrollCapture={handleScroll} ref={ref}>
        <Table {...props?.table}>
          {caption && (
            <TableCaption
              {...props?.caption}
              className={ctw('text-foreground', props?.caption?.className)}
            >
              {caption}
            </TableCaption>
          )}
          <TableHeader className="border-0" {...props?.header}>
            {table.getHeaderGroups()?.map(({ id, headers }) => (
              <TableRow
                key={id}
                {...props?.row}
                className={ctw('border-b-none', props?.row?.className)}
              >
                {headers?.map((header, index) => {
                  return (
                    <TableHead
                      key={header.id}
                      {...props?.head}
                      className={ctw(
                        'sticky top-0 z-0 h-[34px] bg-white p-1 text-[14px] font-bold text-[#787981]',
                        {
                          '!pl-3.5': index === 0,
                        },
                        props?.head?.className,
                      )}
                    >
                      {header.column.id === 'select' && !header.isPlaceholder && (
                        <span className={'pe-4'}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                      )}
                      {header.column.getCanSort() &&
                        !header.isPlaceholder &&
                        header.column.id !== 'select' && (
                          <button
                            className="flex h-9 flex-row items-center gap-x-2 px-3 text-left text-[#A3A3A3]"
                            onClick={() => header.column.toggleSorting()}
                          >
                            <span>
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </span>
                            <ChevronDown
                              className={ctw('d-4', {
                                'rotate-180': header.column.getIsSorted() === 'asc',
                              })}
                            />
                          </button>
                        )}
                      {!header.column.getCanSort() &&
                        !header.isPlaceholder &&
                        header.column.id !== 'select' &&
                        flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody {...props?.body}>
            {!!table.getRowModel().rows?.length &&
              table.getRowModel().rows?.map(row => (
                <React.Fragment key={row.id}>
                  <TableRow
                    key={row.id}
                    {...props?.row}
                    className={ctw(
                      'h-[76px] border-b-0 even:bg-[#F4F6FD]/50 hover:bg-[#F4F6FD]/90',
                      props?.row?.className,
                    )}
                  >
                    {row.getVisibleCells()?.map(cell => (
                      <TableCell
                        key={cell.id}
                        {...props?.cell}
                        className={ctw('!py-px !pl-3.5', props?.cell?.className)}
                      >
                        {CellContentWrapper ? (
                          <CellContentWrapper cell={cell}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </CellContentWrapper>
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  {CollapsibleContent && (
                    <Collapsible open={row.getIsExpanded()} asChild>
                      <ShadCNCollapsibleContent asChild>
                        <TableRow className={`max-h-[228px] border-y-[1px]`}>
                          <TableCell colSpan={10} className={`p-8`}>
                            <CollapsibleContent row={row.original} />
                          </TableCell>
                        </TableRow>
                      </ShadCNCollapsibleContent>
                    </Collapsible>
                  )}
                </React.Fragment>
              ))}
            {!table.getRowModel().rows?.length && (
              <TableRow
                {...props?.row}
                className={ctw('hover:bg-unset h-6 border-none', props?.row?.className)}
              >
                <TableCell
                  colSpan={columns?.length}
                  {...props?.noDataCell}
                  className={ctw('p-4', props?.noDataCell?.className)}
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
};

const forward = React.forwardRef as <T, P = NonNullable<unknown>>(
  render: (props: P, ref: React.Ref<T>) => React.ReactNode,
) => (props: P & React.RefAttributes<T>) => React.ReactNode;
export const DataTable = forward(DataTableBase);
