import { useFoxerQuery } from '@hugomrdias/foxer-react'
import { useState } from 'react'
import { useConnection } from 'wagmi'

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { Button } from './ui/button'

type DatasetRow = {
  dataSetId: bigint
  providerId: bigint
  payer: string
  serviceProvider: string
  payee: string
  blockNumber?: bigint | number | string | null
  metadata?: Record<string, unknown> | null
}

function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined) {
    return '-'
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

export function Datasets() {
  const { address } = useConnection()
  const [page, setPage] = useState(0)
  const pageSize = 50
  const { data, isPending } = useFoxerQuery({
    live: true,
    queryFn: (db) =>
      db.query.datasets.findMany({
        limit: pageSize + 1,
        offset: page * pageSize,
        orderBy: {
          blockNumber: 'desc',
        },
        where: {
          payer: address,
        },
      }),
  })

  const fetchedRows = (data ?? []) as DatasetRow[]
  const hasNextPage = fetchedRows.length > pageSize
  const rows = fetchedRows.slice(0, pageSize)

  return (
    <div className="py-4 flex flex-col gap-2">
      <p>Datasets</p>

      <Table>
        <TableCaption>Datasets for your address. Page {page + 1}.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Dataset ID</TableHead>
            <TableHead>Provider ID</TableHead>
            <TableHead>Service Provider</TableHead>
            <TableHead>Metadata</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            <TableRow>
              <TableCell colSpan={4}>Loading datasets...</TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4}>No datasets found.</TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => (
              <TableRow key={`${String(row.dataSetId)}-${String(index)}`}>
                <TableCell className="font-medium">
                  {String(row.dataSetId)}
                </TableCell>
                <TableCell>{String(row.providerId)}</TableCell>
                <TableCell className="max-w-[220px] truncate">
                  {row.serviceProvider}
                </TableCell>
                <TableCell className="max-w-[320px]">
                  {row.metadata ? (
                    <div className="flex flex-col items-start gap-1.5">
                      {Object.entries(row.metadata).length > 0
                        ? Object.entries(row.metadata).map(([key, value]) => (
                            <div
                              className="inline-flex w-fit max-w-full flex-col rounded-none border border-border/60 bg-muted/30 px-2 py-1"
                              key={key}
                            >
                              <p className="text-[10px] text-muted-foreground">
                                {key}
                              </p>
                              <p className="max-w-full font-mono text-[11px] break-all whitespace-normal">
                                {formatMetadataValue(value)}
                              </p>
                            </div>
                          ))
                        : '-'}
                    </div>
                  ) : (
                    '-'
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <div className="flex items-center gap-2">
        <Button
          disabled={page === 0 || isPending}
          onClick={() => setPage((prev) => Math.max(0, prev - 1))}
          size="sm"
          variant="outline"
        >
          Previous
        </Button>
        <Button
          disabled={!hasNextPage || isPending}
          onClick={() => setPage((prev) => prev + 1)}
          size="sm"
          variant="outline"
        >
          Next
        </Button>
      </div>
    </div>
  )
}

export default Datasets
