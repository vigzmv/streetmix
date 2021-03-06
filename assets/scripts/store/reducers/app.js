import { SET_APP_FLAGS, SET_PRINTING, EVERYTHING_LOADED } from '../actions'

const initialState = {
  readOnly: false,
  printing: false,
  everythingLoaded: false
}

const app = (state = initialState, action) => {
  switch (action.type) {
    case SET_APP_FLAGS:
      return {
        ...state,
        ...action.flags
      }
    case SET_PRINTING:
      return {
        ...state,
        printing: action.printing
      }
    case EVERYTHING_LOADED:
      return {
        ...state,
        everythingLoaded: true
      }
    default:
      return state
  }
}

export default app
