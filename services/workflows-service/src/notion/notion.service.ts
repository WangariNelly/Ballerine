import { AppLoggerService } from '@/common/app-logger/app-logger.service';
import { Client } from '@notionhq/client';
import {
  PageObjectResponse,
  QueryDatabaseResponse,
} from '@notionhq/client/build/src/api-endpoints';
import { env } from '@/env';
import { Injectable } from '@nestjs/common';

@Injectable()
export class NotionService {
  private readonly client: Client;

  constructor(private readonly logger: AppLoggerService) {
    this.client = new Client({
      auth: env.NOTION_API_KEY,
    });
  }

  public async getAllDatabaseRecordsValues({ databaseId }: { databaseId: string }) {
    const data = await this.extractDatabaseContent(databaseId);

    return data.map(record => {
      return Object.fromEntries(
        Object.entries(record)
          .map(([fieldName, notionFieldPageObjectResponse]) => {
            return [fieldName, this.transformNotionFieldToValue(notionFieldPageObjectResponse)];
          })
          .filter(([, value]) => value === 0 || !!value),
      );
    });
  }

  private async extractDatabaseContent(databaseId: string) {
    let database: QueryDatabaseResponse | null = null;
    const records: QueryDatabaseResponse['results'] = [];

    do {
      database = await this.client.databases.query({
        database_id: databaseId,
        // @ts-ignore
        ...(database?.next_cursor && { start_cursor: database.next_cursor }),
      });
      records.push(...database.results);
    } while (database.next_cursor);

    const sanitizedRecords = records.filter(
      (record): record is PageObjectResponse => record.object === 'page' && 'properties' in record,
    );

    return sanitizedRecords.map(({ properties }) => properties);
  }

  private transformNotionFieldToValue(
    notionField: PageObjectResponse['properties'][keyof PageObjectResponse['properties']] & {
      formula?: any;
    },
  ) {
    if (notionField.type === 'rich_text') {
      return notionField.rich_text[0]?.plain_text;
    }

    if (notionField.type === 'multi_select') {
      return notionField.multi_select.map(({ name }) => name);
    }

    if (notionField.type === 'select') {
      return notionField.select?.name;
    }

    if (notionField.type === 'number') {
      return notionField.number;
    }

    if (notionField.type === 'date') {
      return notionField.date?.start;
    }

    if (notionField.type === 'url') {
      return notionField.url;
    }

    if (notionField.type === 'formula') {
      return notionField.formula[notionField.formula.type];
    }

    if (notionField.type === 'relation') {
      return notionField.relation.map(({ id }) => id);
    }

    if (notionField.type === 'title') {
      return notionField.title[0]?.plain_text;
    }

    if (notionField.type === 'unique_id') {
      return notionField.unique_id.number;
    }

    throw new Error(`Notion field type ${notionField.type} is not supported`);
  }
}
