import { AnchorButton, Button, Card, H1 } from '@blueprintjs/core'
import { LoadingStatus } from './LoadingState'
import type { useAdminSession } from './useAdminSession'

export function AdminConnection({ status, refresh, signOut, signingOut, error }: ReturnType<typeof useAdminSession>) {
  const loginFailed = new URLSearchParams(window.location.search).has('error')
  return <main className="admin-session"><Card>
    <H1>Ysocial Admin</H1>
    {status === 'loading' && <LoadingStatus label="Checking your session…" />}
    {status === 'anonymous' && <>
      {loginFailed && <p role="alert">Could not sign in. Please try again.</p>}
      <AnchorButton href="/auth/admin/login" intent="primary">Sign in with CNS</AnchorButton>
    </>}
    {status === 'forbidden' && <>
      <p role="alert">You don’t have the privileges to access the admin dashboard. Only admins and moderators can open it.</p>
      <AnchorButton href="https://ysocial.cns-preview.de" intent="primary">Go to Ysocial</AnchorButton>{' '}
      <Button onClick={signOut} loading={signingOut}>Sign out</Button>
    </>}
    {status === 'unavailable' && <>
      <p role="alert">Could not check your session.</p>
      <Button onClick={refresh}>Retry</Button>
    </>}
    {error && <p role="alert">{error}</p>}
  </Card></main>
}
