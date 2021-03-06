import Cookies from 'js-cookie'

import { API_URL } from '../app/config'
import { showError, ERRORS } from '../app/errors'
import { trackEvent } from '../app/event_tracking'
import { checkIfEverythingIsLoaded } from '../app/initialization'
import { MODES, processMode, getMode, setMode } from '../app/mode'
import { getStreet } from '../streets/data_model'
import { setPromoteStreet } from '../streets/remix'
import { fetchStreetFromServer } from '../streets/xhr'
import { checkIfSignInAndGeolocationLoaded } from './localization'
import { loadSettings, getSettings, setSettings } from './settings'
import store from '../store'
import {
  SET_USER_SIGN_IN_DATA,
  SET_USER_SIGNED_IN_STATE,
  SET_USER_SIGN_IN_LOADED_STATE
} from '../store/actions'
import { rememberUserProfile } from '../store/actions/user'

const USER_ID_COOKIE = 'user_id'
const SIGN_IN_TOKEN_COOKIE = 'login_token'
const LOCAL_STORAGE_SIGN_IN_ID = 'sign-in'

export function getSignInData () {
  return store.getState().user.signInData
}

// Action creator
function createSetSignInData (data) {
  return {
    type: SET_USER_SIGN_IN_DATA,
    signInData: data
  }
}

function setSignInData (data) {
  store.dispatch(createSetSignInData(data))
}

function clearSignInData () {
  store.dispatch(createSetSignInData(null))
}

export function isSignedIn () {
  return store.getState().user.signedIn
}

// Action creator
function createSignedInState (bool) {
  return {
    type: SET_USER_SIGNED_IN_STATE,
    signedIn: bool
  }
}

function setSignedInState (bool) {
  store.dispatch(createSignedInState(bool))
}

export function isSignInLoaded () {
  return store.getState().user.signInLoaded
}

// Action creator
function createSignInLoadedState (bool) {
  return {
    type: SET_USER_SIGN_IN_LOADED_STATE,
    signInLoaded: bool
  }
}

function setSignInLoadedState (bool) {
  store.dispatch(createSignInLoadedState(bool))
}

export function goReloadClearSignIn () {
  clearSignInData()
  saveSignInDataLocally()
  removeSignInCookies()

  window.location.reload()
}

export function onStorageChange () {
  if (isSignedIn() && !window.localStorage[LOCAL_STORAGE_SIGN_IN_ID]) {
    setMode(MODES.FORCE_RELOAD_SIGN_OUT)
    processMode()
  } else if (!isSignedIn() && window.localStorage[LOCAL_STORAGE_SIGN_IN_ID]) {
    setMode(MODES.FORCE_RELOAD_SIGN_IN)
    processMode()
  }
}

function saveSignInDataLocally () {
  const signInData = getSignInData()
  if (signInData) {
    window.localStorage[LOCAL_STORAGE_SIGN_IN_ID] = JSON.stringify(signInData)
  } else {
    window.localStorage[LOCAL_STORAGE_SIGN_IN_ID] = ''
  }
}

function removeSignInCookies () {
  Cookies.remove(SIGN_IN_TOKEN_COOKIE)
  Cookies.remove(USER_ID_COOKIE)
}

export function loadSignIn () {
  setSignInLoadedState(false)

  var signInCookie = Cookies.get(SIGN_IN_TOKEN_COOKIE)
  var userIdCookie = Cookies.get(USER_ID_COOKIE)

  if (signInCookie && userIdCookie) {
    setSignInData({ token: signInCookie, userId: userIdCookie })

    removeSignInCookies()
    saveSignInDataLocally()
  } else {
    if (window.localStorage[LOCAL_STORAGE_SIGN_IN_ID]) {
      setSignInData(JSON.parse(window.localStorage[LOCAL_STORAGE_SIGN_IN_ID]))
    }
  }

  const signInData = getSignInData()

  if (signInData && signInData.token && signInData.userId) {
    fetchSignInDetails(signInData.userId)

    // This block was commented out because caching username causes
    // failures when the database is cleared. TODO Perhaps we should
    // be handling this more deftly.
    /* if (signInData.details) {
      signedIn = true
      _signInLoaded()
    } else {
      fetchSignInDetails(signInData.userId)
    } */
  } else {
    setSignedInState(false)
    _signInLoaded()
  }
}

function fetchSignInDetails (userId) {
  const options = {
    headers: { 'Authorization': getAuthHeader() }
  }

  window.fetch(API_URL + 'v1/users/' + userId, options)
    .then(response => {
      if (!response.ok) {
        throw response
      }

      return response.json()
    })
    .then(receiveSignInDetails)
    .catch(errorReceiveSignInDetails)
}

function receiveSignInDetails (details) {
  const signInData = getSignInData()
  signInData.details = details
  setSignInData(signInData)
  saveSignInDataLocally()

  // cache the users profile image so we don't have to request it later
  store.dispatch(rememberUserProfile(details))

  setSignedInState(true)
  _signInLoaded()
}

function errorReceiveSignInDetails (data) {
  // If we get data.status === 0, it means that the user opened the page and
  // closed is quickly, so the request was aborted. We choose to do nothing
  // instead of clobbering sign in data below and effectively signing the
  // user out. Issue #302.

  // It also, unfortunately, might mean regular server failure, too. Marcin
  // doesn’t know what to do with it yet. Open issue #339.

  /* if (data.status === 0) {
    showError(ERRORS.NEW_STREET_SERVER_FAILURE, true)
    return
  } */

  if (data.status === 401) {
    trackEvent('ERROR', 'ERROR_RM1', null, null, false)

    signOut(true)

    showError(ERRORS.SIGN_IN_401, true)
    return
  } else if (data.status === 503) {
    trackEvent('ERROR', 'ERROR_15A', null, null, false)

    showError(ERRORS.SIGN_IN_SERVER_FAILURE, true)
    return
  }

  // Fail silently

  clearSignInData()
  setSignedInState(false)
  _signInLoaded()
}

export function onSignOutClick (event) {
  signOut(false)

  if (event) {
    event.preventDefault()
  }
}

function signOut (quiet) {
  setSettings({
    lastStreetId: null,
    lastStreetNamespacedId: null,
    lastStreetCreatorId: null
  })

  removeSignInCookies()
  window.localStorage.removeItem(LOCAL_STORAGE_SIGN_IN_ID)
  sendSignOutToServer(quiet)
}

export function getAuthHeader () {
  const signInData = getSignInData()
  if (signInData && signInData.token) {
    return 'Streetmix realm="" loginToken="' + signInData.token + '"'
  } else {
    return ''
  }
}

function sendSignOutToServer (quiet) {
  const signInData = getSignInData()
  const options = {
    method: 'DELETE',
    headers: { 'Authorization': getAuthHeader() }
  }

  // TODO const
  window.fetch(API_URL + 'v1/users/' + signInData.userId + '/login-token', options)
    .then(response => {
      if (!quiet) {
        receiveSignOutConfirmationFromServer()
      }
    })
    .catch(errorReceiveSignOutConfirmationFromServer)
}

function receiveSignOutConfirmationFromServer () {
  setMode(MODES.SIGN_OUT)
  processMode()
}

function errorReceiveSignOutConfirmationFromServer () {
  setMode(MODES.SIGN_OUT)
  processMode()
}

function _signInLoaded () {
  loadSettings()

  var street = getStreet()
  let mode = getMode()
  if ((mode === MODES.CONTINUE) || (mode === MODES.JUST_SIGNED_IN) ||
    (mode === MODES.USER_GALLERY) || (mode === MODES.GLOBAL_GALLERY)) {
    let settings = getSettings()
    if (settings.lastStreetId) {
      street.creatorId = settings.lastStreetCreatorId
      street.id = settings.lastStreetId
      street.namespacedId = settings.lastStreetNamespacedId

      if ((mode === MODES.JUST_SIGNED_IN) && (!street.creatorId)) {
        setPromoteStreet(true)
      }

      if (mode === MODES.JUST_SIGNED_IN) {
        setMode(MODES.CONTINUE)
      }
    } else {
      setMode(MODES.NEW_STREET)
    }
  }
  mode = getMode()
  switch (mode) {
    case MODES.EXISTING_STREET:
    case MODES.CONTINUE:
    case MODES.USER_GALLERY:
    case MODES.GLOBAL_GALLERY:
      fetchStreetFromServer()
      break
  }

  setSignInLoadedState(true)
  document.querySelector('#loading-progress').value++
  checkIfSignInAndGeolocationLoaded()
  checkIfEverythingIsLoaded()
}
