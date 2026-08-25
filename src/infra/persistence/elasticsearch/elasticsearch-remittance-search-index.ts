import { elasticsearchClient } from "../../config/database/elasticsearch/elasticsearch-client"
import {
  RemittanceSearchDocument,
  RemittanceSearchIndex,
  RemittanceSearchQuery,
} from "../../../application/remittance/repositories/remittance-search-index"

const INDEX = 'remittances'

// Explicit mapping rather than relying on Elasticsearch's dynamic mapping:
// dynamic mapping would infer senderAccountId/recipientAccountId/status as
// `text` (analyzed, tokenized) with an auto-generated `.keyword` sub-field —
// exact-match `term` queries against the bare field name would then behave
// unpredictably. Declaring these as `keyword` up front means the `term`
// queries in search() below can target the field name directly. This is the
// Elasticsearch equivalent of migrations/001_init_schema.sql for Postgres,
// just without a formal migration runner — there's exactly one index, so a
// lazy "create if missing" call is enough for this showcase.
async function ensureIndexExists(): Promise<void> {
  const exists = await elasticsearchClient.indices.exists({ index: INDEX })
  if (exists) return

  await elasticsearchClient.indices.create({
    index: INDEX,
    mappings: {
      properties: {
        remittanceId: { type: 'keyword' },
        senderAccountId: { type: 'keyword' },
        recipientAccountId: { type: 'keyword' },
        status: { type: 'keyword' },
        sourceCurrency: { type: 'keyword' },
        destinationCurrency: { type: 'keyword' },
        sourceAmountMinorUnits: { type: 'long' },
        feeMinorUnits: { type: 'long' },
        convertedAmountMinorUnits: { type: 'long' },
        exchangeRate: { type: 'double' },
        createdAt: { type: 'date' },
      },
    },
  })
}

export class ElasticsearchRemittanceSearchIndex implements RemittanceSearchIndex {

  async index(document: RemittanceSearchDocument): Promise<void> {
    await ensureIndexExists()
    // Indexed by remittanceId so a redelivered/duplicate Kafka message
    // (at-least-once delivery) overwrites the same document instead of
    // creating a duplicate — indexing is naturally idempotent this way,
    // with no separate dedup step needed.
    await elasticsearchClient.index({
      index: INDEX,
      id: document.remittanceId,
      document,
    })
  }

  async search(query: RemittanceSearchQuery): Promise<RemittanceSearchDocument[]> {
    await ensureIndexExists()

    const filters: object[] = []

    // Matches either side of the transfer — "remittances involving this
    // account" (see RemittanceSearchQuery's comment).
    filters.push({
      bool: {
        should: [
          { term: { senderAccountId: query.accountId } },
          { term: { recipientAccountId: query.accountId } },
        ],
        minimum_should_match: 1,
      },
    })

    if (query.status) {
      filters.push({ term: { status: query.status } })
    }

    if (query.from || query.to) {
      filters.push({
        range: {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        },
      })
    }

    const result = await elasticsearchClient.search<RemittanceSearchDocument>({
      index: INDEX,
      query: { bool: { filter: filters } },
      sort: [{ createdAt: { order: 'desc' } }],
      size: query.limit ?? 20,
    })

    return result.hits.hits
      .map((hit) => hit._source)
      .filter((source): source is RemittanceSearchDocument => source !== undefined)
  }

}
