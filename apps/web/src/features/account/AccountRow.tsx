import { Card } from '@lullabo/ui/card'
import { useQuery } from '@tanstack/react-query'

import { Chevron } from '../../components/icons/Chevron'
import { ListRow } from '../../components/ListRow'
import { UserAvatar } from '../../components/UserAvatar'
import { m } from '../../paraglide/messages.js'
import { useAccount } from '../../sync/use-access'
import { useSyncStatusText } from './AccountSettings'
import { accountQueries } from './queries'

/** The top of settings: who is signed in and the sync state, or an invitation to sign in. */
export function AccountRow() {
  const account = useAccount()
  const syncStatus = useSyncStatusText()
  const { data: user } = useQuery({ ...accountQueries.me(), enabled: account !== undefined })

  if (!account) {
    return (
      <Card tone="primary" className="py-1">
        <ListRow
          link={{ to: '/settings/account' }}
          title={m.signInOrUpAction()}
          detail={m.settingsSignedOut()}
          detailWraps
          trailing={<Chevron />}
        />
      </Card>
    )
  }
  const name = user?.name ?? account.userName ?? ''
  return (
    <Card className="py-1">
      <ListRow
        link={{ to: '/settings/account' }}
        leading={<UserAvatar name={name} image={user?.image} />}
        title={<span className="truncate">{name}</span>}
        detail={
          <>
            {user?.email && <span className="block truncate">{user.email}</span>}
            <span className="block truncate">{syncStatus}</span>
          </>
        }
        detailWraps
        trailing={<Chevron />}
      />
    </Card>
  )
}
