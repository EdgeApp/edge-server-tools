import { ServerUtilError } from '../util/server-util-error'

export interface AdminUserInfo {
  couchUri: string
  name: string
  password: string
}
export interface UserInfo {
  couchUri: string
  name: string
  password: string
  databases?: string[]
}

export async function createRegularUser(userInfo: UserInfo): Promise<void> {
  const user = {
    name: userInfo.name,
    password: userInfo.password,
    roles: [],
    type: 'user'
  }
  const completeUri = `${userInfo.couchUri}/_users/org.couchdb.user:${userInfo.name}`
  const response = await fetch(completeUri, {
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'PUT',
    body: JSON.stringify(user)
  })
  if (!response.ok) {
    const errorResponse = await response.json()
    if (errorResponse.error !== 'conflict') {
      throw new ServerUtilError(
        `Could not create user ${userInfo.name}`,
        errorResponse
      )
    }
  }
  if (userInfo.databases != null) {
    for (const database of userInfo.databases) {
      const databaseUri = `${userInfo.couchUri}/${database}/_security`
      const fetchResponse = await fetch(databaseUri, {
        headers: {
          'Content-Type': 'application/json'
        },
        method: 'GET'
      })
      const fetchResponseObj = await fetchResponse.json()
      if (fetchResponseObj.members.names == null) {
        fetchResponseObj.members.names = []
      }
      if (fetchResponseObj.members.names.includes(userInfo.name) === false) {
        fetchResponseObj.members.names.push(userInfo.name)
      }
      const insertResponse = await fetch(databaseUri, {
        headers: {
          'Content-Type': 'application/json'
        },
        method: 'PUT',
        body: JSON.stringify(fetchResponseObj)
      })
      if (!insertResponse.ok) {
        const errorResponse = await response.json()
        throw new ServerUtilError(
          `Could not give user ${userInfo.name} access to database ${database}`,
          errorResponse
        )
      }
    }
  }
}

export async function createAdminUser(userInfo: AdminUserInfo): Promise<void> {
  const completeUri = `${userInfo.couchUri}/_node/_local/_config/admins/${userInfo.name}`
  const response = await fetch(completeUri, {
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'PUT',
    body: JSON.stringify(userInfo.password)
  })
  if (!response.ok) {
    const errorResponse = await response.json()
    throw new ServerUtilError(
      `Could not create user ${userInfo.name}`,
      errorResponse
    )
  }
}
