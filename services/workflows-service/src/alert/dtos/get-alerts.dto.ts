import { PageDto, sortDirections, validateOrderBy } from '@/common/dto';
import { ApiProperty } from '@nestjs/swagger';
import { AlertState, AlertStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { IsOptional } from 'class-validator';
import { SortableByModel } from '@/common/types';

export class FilterDto {
  @ApiProperty({
    type: [String],
    required: false,
    name: 'filter[assigneeId][0]',
  })
  assigneeId?: Array<string | null>;

  @ApiProperty({
    enum: AlertStatus,
    type: [String],
    required: false,
    name: 'filter[status][0]',
  })
  status?: AlertStatus[];

  @ApiProperty({
    enum: AlertState,
    type: [String],
    required: false,
    name: 'filter[state][0]',
    isArray: true,
  })
  state?: AlertState[];

  @ApiProperty({
    type: [String],
    required: false,
    name: 'filter[correlationIds][0]',
  })
  correlationIds?: string[];
}

export class FindAlertsDto {
  @ApiProperty({ required: false })
  search?: string;

  @ApiProperty({ type: PageDto })
  page!: PageDto;

  @ApiProperty({
    required: false,
    type: FilterDto,
  })
  filter?: FilterDto;

  @IsOptional()
  @ApiProperty({
    type: String,
    required: false,
    description: 'Column to sort by and direction separated by a colon',
    examples: [
      { value: 'createdAt:asc' },
      { value: 'dataTimestamp:desc' },
      { value: 'status:asc' },
    ],
  })
  orderBy?: `${string}:asc` | `${string}:desc`;
}

const sortableColumnsAlerts: SortableByModel<Prisma.AlertOrderByWithRelationInput> = [
  'createdAt',
  'dataTimestamp',
  'status',
];

export const FindAlertsSchema = z.object({
  search: z.string().min(1, 'Please enter a valid value').optional().or(z.literal('')),
  page: z.object({
    number: z.coerce.number().int().positive(),
    size: z.coerce.number().int().positive().max(100),
  }),
  orderBy: z
    .custom<`${(typeof sortableColumnsAlerts)[number]}:${(typeof sortDirections)[number]}`>(value =>
      validateOrderBy(value, sortableColumnsAlerts),
    )
    .transform(value => {
      const [column = '', direction = ''] = value.split(':');

      if (!column || !direction) {
        throw new Error('Invalid orderBy');
      }

      return {
        [column]: direction,
      };
    })
    .optional(),
  filter: z
    .object({
      assigneeId: z
        .array(z.union([z.literal('').transform(() => null), z.string().min(1)]))
        .optional(),
      status: z.array(z.nativeEnum(AlertStatus)).optional(),
      state: z.array(z.nativeEnum(AlertState)).optional(),
      correlationIds: z.array(z.string()).optional(),
    })
    .optional(),
});
