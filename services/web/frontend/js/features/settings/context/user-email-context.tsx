import {
  createContext,
  useEffect,
  useContext,
  useReducer,
  useCallback,
} from 'react'
import useSafeDispatch from '../../../shared/hooks/use-safe-dispatch'
import * as ActionCreators from '../utils/action-creators'
import { UserEmailData } from '../../../../../types/user-email'
import { Nullable } from '../../../../../types/utils'
import { Affiliation } from '../../../../../types/affiliation'
import { normalize, NormalizedObject } from '../../../utils/normalize'
import { getJSON } from '../../../infrastructure/fetch-json'
import useAsync from '../../../shared/hooks/use-async'
import usePersistedState from '../../../shared/hooks/use-persisted-state'

const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000

// eslint-disable-next-line no-unused-vars
export enum Actions {
  SET_DATA = 'SET_DATA', // eslint-disable-line no-unused-vars
  SET_LOADING_STATE = 'SET_LOADING_STATE', // eslint-disable-line no-unused-vars
  MAKE_PRIMARY = 'MAKE_PRIMARY', // eslint-disable-line no-unused-vars
  DELETE_EMAIL = 'DELETE_EMAIL', // eslint-disable-line no-unused-vars
  SET_EMAIL_AFFILIATION_BEING_EDITED = 'SET_EMAIL_AFFILIATION_BEING_EDITED', // eslint-disable-line no-unused-vars
  UPDATE_AFFILIATION = 'UPDATE_AFFILIATION', // eslint-disable-line no-unused-vars
}

export type ActionSetData = {
  type: Actions.SET_DATA
  payload: UserEmailData[]
}

export type ActionSetLoading = {
  type: Actions.SET_LOADING_STATE
  payload: boolean
}

export type ActionMakePrimary = {
  type: Actions.MAKE_PRIMARY
  payload: UserEmailData['email']
}

export type ActionDeleteEmail = {
  type: Actions.DELETE_EMAIL
  payload: UserEmailData['email']
}

export type ActionSetEmailAffiliationBeingEdited = {
  type: Actions.SET_EMAIL_AFFILIATION_BEING_EDITED
  payload: Nullable<UserEmailData['email']>
}

export type ActionUpdateAffiliation = {
  type: Actions.UPDATE_AFFILIATION
  payload: {
    email: UserEmailData['email']
    role: Affiliation['role']
    department: Affiliation['department']
  }
}

export type State = {
  isLoading: boolean
  data: {
    byId: NormalizedObject<UserEmailData>
    linkedInstitutionIds: NonNullable<UserEmailData['samlProviderId']>[]
    emailAffiliationBeingEdited: Nullable<UserEmailData['email']>
  }
}

type Action =
  | ActionSetData
  | ActionSetLoading
  | ActionMakePrimary
  | ActionDeleteEmail
  | ActionSetEmailAffiliationBeingEdited
  | ActionUpdateAffiliation

const setData = (state: State, action: ActionSetData) => {
  const normalized = normalize<UserEmailData>(action.payload, {
    idAttribute: 'email',
  })
  const byId = normalized || {}

  return {
    ...state,
    data: {
      ...initialState.data,
      byId,
    },
  }
}

const setLoadingAction = (state: State, action: ActionSetLoading) => ({
  ...state,
  isLoading: action.payload,
})

const makePrimaryAction = (state: State, action: ActionMakePrimary) => {
  const byId: State['data']['byId'] = {}
  for (const id of Object.keys(state.data.byId)) {
    byId[id] = {
      ...state.data.byId[id],
      default: state.data.byId[id].email === action.payload,
    }
  }

  return {
    ...state,
    data: {
      ...state.data,
      byId,
    },
  }
}

const deleteEmailAction = (state: State, action: ActionDeleteEmail) => {
  const { [action.payload]: _, ...byId } = state.data.byId

  return {
    ...state,
    data: {
      ...state.data,
      byId,
    },
  }
}

const setEmailAffiliationBeingEditedAction = (
  state: State,
  action: ActionSetEmailAffiliationBeingEdited
) => ({
  ...state,
  data: {
    ...state.data,
    emailAffiliationBeingEdited: action.payload,
  },
})

const updateAffiliationAction = (
  state: State,
  action: ActionUpdateAffiliation
) => {
  const { email, role, department } = action.payload
  const affiliation = state.data.byId[email].affiliation

  return {
    ...state,
    data: {
      ...state.data,
      byId: {
        ...state.data.byId,
        [email]: {
          ...state.data.byId[email],
          ...(affiliation && {
            affiliation: {
              ...affiliation,
              role,
              department,
            },
          }),
        },
      },
      emailAffiliationBeingEdited: null,
    },
  }
}

const initialState: State = {
  isLoading: false,
  data: {
    byId: {},
    linkedInstitutionIds: [],
    emailAffiliationBeingEdited: null,
  },
}

const reducer = (state: State, action: Action) => {
  switch (action.type) {
    case Actions.SET_DATA:
      return setData(state, action)
    case Actions.SET_LOADING_STATE:
      return setLoadingAction(state, action)
    case Actions.MAKE_PRIMARY:
      return makePrimaryAction(state, action)
    case Actions.DELETE_EMAIL:
      return deleteEmailAction(state, action)
    case Actions.SET_EMAIL_AFFILIATION_BEING_EDITED:
      return setEmailAffiliationBeingEditedAction(state, action)
    case Actions.UPDATE_AFFILIATION:
      return updateAffiliationAction(state, action)
    default:
      return state
  }
}

function useUserEmails() {
  const [, setExpirationDate] = usePersistedState(
    'showInstitutionalLeaversSurveyUntil',
    0
  )
  const [state, unsafeDispatch] = useReducer(reducer, initialState)
  const dispatch = useSafeDispatch(unsafeDispatch)
  const { data, isLoading, isError, isSuccess, runAsync } = useAsync()

  const getEmails = useCallback(() => {
    runAsync<UserEmailData[]>(getJSON('/user/emails?ensureAffiliation=true'))
      .then(data => {
        dispatch(ActionCreators.setData(data))
      })
      .catch(() => {})
  }, [runAsync, dispatch])

  // Get emails on page load
  useEffect(() => {
    getEmails()
  }, [getEmails])

  const resetLeaversSurveyExpiration = useCallback(
    (deletedEmail: UserEmailData) => {
      if (!data) {
        return
      }
      const emailData = data as UserEmailData[]
      if (
        deletedEmail.emailHasInstitutionLicence ||
        deletedEmail.affiliation?.pastReconfirmDate
      ) {
        const stillHasLicenseAccess = emailData.some(
          userEmail => userEmail.emailHasInstitutionLicence
        )
        if (stillHasLicenseAccess) {
          setExpirationDate(Date.now() + ONE_WEEK_IN_MS)
        }
      }
    },
    [data, setExpirationDate]
  )

  return {
    state,
    isInitializing: isLoading && !data,
    isInitializingSuccess: isSuccess,
    isInitializingError: isError,
    getEmails,
    resetLeaversSurveyExpiration,
    setLoading: useCallback(
      (flag: boolean) => dispatch(ActionCreators.setLoading(flag)),
      [dispatch]
    ),
    makePrimary: useCallback(
      (email: UserEmailData['email']) =>
        dispatch(ActionCreators.makePrimary(email)),
      [dispatch]
    ),
    deleteEmail: useCallback(
      (email: UserEmailData['email']) =>
        dispatch(ActionCreators.deleteEmail(email)),
      [dispatch]
    ),
    setEmailAffiliationBeingEdited: useCallback(
      (email: Nullable<UserEmailData['email']>) =>
        dispatch(ActionCreators.setEmailAffiliationBeingEdited(email)),
      [dispatch]
    ),
    updateAffiliation: useCallback(
      (
        email: UserEmailData['email'],
        role: Affiliation['role'],
        department: Affiliation['department']
      ) => dispatch(ActionCreators.updateAffiliation(email, role, department)),
      [dispatch]
    ),
  }
}

const UserEmailsContext = createContext<
  ReturnType<typeof useUserEmails> | undefined
>(undefined)
UserEmailsContext.displayName = 'UserEmailsContext'

type UserEmailsProviderProps = {
  children: React.ReactNode
} & Record<string, unknown>

function UserEmailsProvider(props: UserEmailsProviderProps) {
  const value = useUserEmails()

  return <UserEmailsContext.Provider value={value} {...props} />
}

const useUserEmailsContext = () => {
  const context = useContext(UserEmailsContext)

  if (context === undefined) {
    throw new Error('useUserEmailsContext must be used in a UserEmailsProvider')
  }

  return context
}

export { UserEmailsProvider, useUserEmailsContext }
