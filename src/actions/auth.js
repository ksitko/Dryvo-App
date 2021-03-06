import {
	ROOT_URL,
	TOKEN_KEY,
	REFRESH_TOKEN_KEY,
	signUpRoles,
	ENV
} from "../consts"
import { Linking } from "react-native"
import Storage from "../services/Storage"
import { LOGIN, LOGOUT, ERROR } from "../reducers/consts"
import { fetchOrError, Analytics } from "./utils"

const loginOrRegister = async (endpoint, params, dispatch, callback) => {
	const resp = await dispatch(fetchOrError(endpoint, params))
	if (resp) {
		await setTokens(resp.json.auth_token, resp.json.refresh_token)
		await dispatch(setUser(resp.json.user))
		await callback(resp.json.user)
	} else await callback(undefined)
}

export const directLogin = (email, password, callback) => {
	return async dispatch => {
		const requestParams = {
			method: "POST",
			body: JSON.stringify({ email, password })
		}
		await loginOrRegister(
			"/login/direct",
			requestParams,
			dispatch,
			callback
		)
	}
}

export const register = (params, callback, role = "") => {
	return async dispatch => {
		var data = new FormData()
		Object.keys(params).forEach(key => data.append(key, params[key]))
		const requestParams = {
			method: "POST",
			headers: {
				"Content-Type": "multipart/form-data"
			},
			body: data
		}
		const newCallback = async user => {
			if (user) {
				let roleRequest
				if (role == signUpRoles.student) {
					roleRequest = await dispatch(
						fetchOrError(
							"/user/make_student?teacher_id=" +
								params.teacher_id,
							{
								method: "GET"
							}
						)
					)
				} else if (role == signUpRoles.teacher) {
					roleRequest = await dispatch(
						fetchOrError("/user/make_teacher?", {
							method: "POST",
							body: JSON.stringify({
								price: params.price,
								lesson_duration: params.duration,
								crn: params.crn
							})
						})
					)
				}
				if (roleRequest) {
					await callback(user)
					return
				}
			}
			await callback(undefined)
		}

		await loginOrRegister(
			"/login/register",
			requestParams,
			dispatch,
			newCallback
		)
	}
}

const setTokens = async (token, refresh_token) => {
	await Storage.setItem(TOKEN_KEY, token, true)
	await Storage.setItem(REFRESH_TOKEN_KEY, refresh_token, true)
}

export const setUser = user => {
	return dispatch => {
		Analytics.setAnalyticsCollectionEnabled(true)
		Analytics.setUserId(`user-${user.id}`)
		Analytics.setUserProperty("Environment", ENV)
		Analytics.setUserProperty("Role", getRole(user))
		Analytics.setUserProperty("created_time", user.created_at)
		dispatch({ type: LOGIN, user: user })
	}
}

export const getRole = user => {
	if (user.hasOwnProperty("teacher_id") && user.is_approved) {
		// it's a teacher
		return "teacher"
	} else if (user.hasOwnProperty("my_teacher") && user.is_approved) {
		// it's a student
		return "student"
	} else {
		return "normal"
	}
}

export const logout = (callback = async () => {}) => {
	return async dispatch => {
		console.log("Logging out")
		await Storage.removeItem(TOKEN_KEY, true)
		await Storage.removeItem(REFRESH_TOKEN_KEY, true)
		await callback()
		setTimeout(() => {
			dispatch({ type: LOGOUT })
		}, 100)
	}
}

export const fetchUser = (callback = () => {}) => {
	/* effectively checks if the token is valid */
	return async dispatch => {
		const resp = await dispatch(
			fetchOrError("/user/me", { method: "GET" }, false)
		)
		if (resp) {
			dispatch(setUser(resp.json.user))
			await callback(resp.json.user)
		} else await callback(undefined)
	}
}

export const exchangeToken = (token, callback) => {
	return async (dispatch, getState) => {
		const { fetchService } = getState()
		try {
			const resp = await fetchService.fetch("/login/exchange_token", {
				method: "POST",
				body: JSON.stringify({
					exchange_token: token
				})
			})
			await setTokens(resp.json.auth_token, resp.json.refresh_token)
			await dispatch(fetchUser(callback))
		} catch (error) {
			dispatch({ type: ERROR })
		}
	}
}

export const openFacebook = (token = "") => {
	let url = ROOT_URL + "/login/facebook"
	if (token) {
		url += "?token=" + token
	}
	Linking.openURL(url)
}
