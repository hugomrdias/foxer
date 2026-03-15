/** biome-ignore-all assist/source/useSortedAttributes: false positive */
/** biome-ignore-all lint/suspicious/noArrayIndexKey: its ok */
/** biome-ignore-all lint/style/noNonNullAssertion: its ok */
import * as SessionKey from '@filoz/synapse-core/session-key'
import { useFoxerQuery } from '@hugomrdias/foxer-react'
import { toast } from 'sonner'
import { generatePrivateKey } from 'viem/accounts'
import { useConnection, useConnectorClient } from 'wagmi'

import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type SessionKeyRow = {
  signer: string
  identity: string
  origin?: string | null
  blockNumber?: bigint | number | string | null
  permissions?: Array<{
    permission?: string | null
    expiry?: bigint | number | string | null
  }> | null
}

export function SessionKeys() {
  const { address } = useConnection()
  const result = useConnectorClient()
  const { data, isPending } = useFoxerQuery({
    live: true,
    queryFn: (db) =>
      db.query.sessionKeys.findMany({
        limit: 10,
        offset: 0,
        orderBy: {
          blockNumber: 'desc',
        },
        where: {
          identity: address,
        },
        with: {
          permissions: true,
        },
      }),
  })

  const rows = (data ?? []) as SessionKeyRow[]

  return (
    <div className="py-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p>Session Keys</p>
        <Button
          size="xs"
          onClick={async () => {
            toast.loading('Creating session key...', {
              id: 'create-session-key',
            })
            const sessionKey = SessionKey.fromSecp256k1({
              privateKey: generatePrivateKey(),
              root: address!,
              chain: result.data!.chain,
            })
            await SessionKey.loginSync(result.data!, {
              address: sessionKey.address,
              origin: 'foxer',
              onHash(hash) {
                toast.loading('Creating session key...', {
                  description: `Waiting for tx ${hash} to be mined...`,
                  id: 'create-session-key',
                })
              },
            })
            toast.success('Session key created', {
              id: 'create-session-key',
            })
          }}
        >
          Create Session Key
        </Button>
      </div>

      <Table>
        <TableCaption>
          Recent session key authorizations for your address.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Signer</TableHead>
            <TableHead>Origin</TableHead>
            <TableHead>Permissions</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            <TableRow>
              <TableCell colSpan={4}>Loading session keys...</TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4}>No session keys found.</TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => (
              <TableRow key={`${row.signer}-${row.identity}-${String(index)}`}>
                <TableCell className="max-w-[260px] truncate font-medium">
                  {row.signer}
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {row.origin ?? '-'}
                </TableCell>
                <TableCell className="max-w-[420px]">
                  {row.permissions && row.permissions.length > 0 ? (
                    <div className="flex flex-col items-start gap-1.5">
                      {row.permissions.map(
                        ({ permission, expiry }, permissionIndex) => (
                          <div
                            key={`${permission ?? 'unknown'}-${String(expiry)}-${permissionIndex}`}
                            className="inline-flex w-fit max-w-full flex-col rounded-none border border-border/60 bg-muted/30 px-2 py-1"
                          >
                            <p className="max-w-full font-mono text-[11px] break-all whitespace-normal">
                              {permission ?? '-'}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Expiry:{' '}
                              {expiry === null || expiry === undefined
                                ? '-'
                                : String(expiry)}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={async () => {
                      toast.loading('Revoking session key...', {
                        id: 'revoke-session-key',
                      })
                      await SessionKey.revokeSync(result.data!, {
                        address: row.signer as `0x${string}`,
                        onHash(hash) {
                          toast.loading('Revoking session key...', {
                            description: `Waiting for tx ${hash} to be mined...`,
                            id: 'revoke-session-key',
                          })
                        },
                      })
                      toast.success('Session key revoked', {
                        id: 'revoke-session-key',
                      })
                    }}
                  >
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export default SessionKeys
