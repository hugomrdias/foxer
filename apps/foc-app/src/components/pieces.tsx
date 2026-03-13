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
import { formatBytes } from '@/lib/utils'

import { Button } from './ui/button'

type PieceRow = {
  id: bigint
  datasetId: bigint
  address: string
  cid: string
  size?: bigint | number | string | null
  blockNumber?: bigint | number | string | null
}

function formatSize(size: PieceRow['size']) {
  if (size === null || size === undefined) {
    return '-'
  }

  const numericSize = Number(size)
  if (Number.isNaN(numericSize)) {
    return String(size)
  }

  return formatBytes(numericSize)
}

export function Pieces() {
  const { address } = useConnection()
  const [page, setPage] = useState(0)
  const pageSize = 50
  const { data, isPending } = useFoxerQuery({
    live: true,
    queryFn: (db) =>
      db.query.pieces.findMany({
        limit: pageSize + 1,
        offset: page * pageSize,
        orderBy: {
          blockNumber: 'desc',
        },
        where: {
          address,
        },
      }),
  })

  const fetchedRows = (data ?? []) as PieceRow[]
  const hasNextPage = fetchedRows.length > pageSize
  const rows = fetchedRows.slice(0, pageSize)

  return (
    <div className="py-4 flex flex-col gap-2">
      <p>Pieces</p>

      <Table>
        <TableCaption>Pieces for your address. Page {page + 1}.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Piece ID</TableHead>
            <TableHead>Dataset ID</TableHead>
            <TableHead>CID</TableHead>
            <TableHead>Size</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            <TableRow>
              <TableCell colSpan={4}>Loading pieces...</TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4}>No pieces found.</TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => (
              <TableRow key={`${String(row.datasetId)}-${String(row.id)}-${String(index)}`}>
                <TableCell className="font-medium">{String(row.id)}</TableCell>
                <TableCell>{String(row.datasetId)}</TableCell>
                <TableCell className="max-w-[320px] truncate">{row.cid}</TableCell>
                <TableCell>{formatSize(row.size)}</TableCell>
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

export default Pieces
