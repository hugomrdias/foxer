import { useQuery } from '@tanstack/react-query'
import { parseAsStringLiteral, useQueryState } from 'nuqs'
import { useConnection, useDisconnect } from 'wagmi'

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatBytes } from '@/lib/utils'

import Datasets from './datasets'
import Pieces from './pieces'
import SessionKeys from './session-keys'
import { Button } from './ui/button'

const items = [
  { label: 'Session Keys', value: 'session-keys' },
  { label: 'Datasets', value: 'datasets' },
  { label: 'Pieces', value: 'pieces' },
] as const

const sectionValues = ['session-keys', 'datasets', 'pieces'] as const
type Section = (typeof sectionValues)[number]

function isSection(value: string): value is Section {
  return sectionValues.includes(value as Section)
}

export function Connected() {
  const { mutate: disconnect } = useDisconnect()
  const { address } = useConnection()
  const [section, setSection] = useQueryState(
    'section',
    parseAsStringLiteral(sectionValues).withDefault('datasets'),
  )
  const { data, isPending } = useQuery<{
    datasets: number
    pieces: number
    piecesSize: bigint
    sessionKeys: number
  }>({
    queryKey: ['totals-by-address', address],
    queryFn: () =>
      fetch(`http://localhost:4200/totals-by-address?address=${address}`).then((res) => res.json()),
  })

  const piecesSize =
    data && data.piecesSize !== undefined ? formatBytes(Number(data.piecesSize)) : '-'

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>{address}</CardDescription>
          <CardAction>
            <Button onClick={() => disconnect()} size="sm">
              Disconnect
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-md border p-3">
              <p className="text-muted-foreground text-xs">Session Keys</p>
              <p className="text-lg font-semibold">
                {isPending ? '...' : (data?.sessionKeys ?? '-')}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-muted-foreground text-xs">Datasets</p>
              <p className="text-lg font-semibold">{isPending ? '...' : (data?.datasets ?? '-')}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-muted-foreground text-xs">Pieces</p>
              <p className="text-lg font-semibold">{isPending ? '...' : (data?.pieces ?? '-')}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-muted-foreground text-xs">Pieces Size</p>
              <p className="text-lg font-semibold">{isPending ? '...' : piecesSize}</p>
            </div>
          </div>
          <Select
            items={items}
            onValueChange={(value) => {
              if (value && isSection(value)) {
                void setSection(value)
              }
            }}
            value={section}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Theme" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {section === 'session-keys' && <SessionKeys />}
          {section === 'datasets' && <Datasets />}
          {section === 'pieces' && <Pieces />}
        </CardContent>
        <CardFooter>
          <p>Filecoin Onchain Cloud</p>
        </CardFooter>
      </Card>
    </div>
  )
}

export default Connected
