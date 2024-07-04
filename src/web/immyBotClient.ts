import * as vscode from 'vscode';

export class ResponseError extends Error {
	public static is(e: unknown, statusCode: number): e is ResponseError {
		return e instanceof ResponseError && e.response.status === statusCode;
	}

	constructor(public readonly response: Response, public readonly body: string) {
		super(`${response.status} ${response.statusText} from ${response.url}: ${body}`);
	}
}
export class ImmyBotClient {
	constructor() { }


	public async fetchJson<T>(route: string, params?: RequestInit): Promise<T> {
		const response = await this.fetch(route, params);
		return await response?.json();
	}
	private async fetch(route: string, params: RequestInit = {}) {
		const routeToFetch = route.startsWith('https:') ? route : `http://localhost:5000` + route;
		try {
			console.log("fetching", routeToFetch, params);
			const response = await fetch(routeToFetch, params);
			if (!response.ok) {
				let body: string;
				try {
					body = await response.text();
					throw new ResponseError(response, body);
				} catch {
					body = '<unreadable>';
				}
			}
			return response;
		}
		catch (exceptionVar) {
			console.log("error", exceptionVar)

			// throw new ResponseError(exceptionVar);
		}
	}
}