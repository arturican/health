export const clientSession = { account: { id: '10000000-0000-4000-8000-000000000001', login: 'alice', timezone: 'Europe/Moscow' }, csrf: 'a'.repeat(64) }
export const clientDiary = { generation: '20000000-0000-4000-8000-000000000001', revision: 1, changeRevision: 0,
  value: { version: 1, showPhotos: true, showDocuments: true }, catalogSeeded: false }
export const jsonResponse = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json', 'X-Account-Id': clientSession.account.id } })
