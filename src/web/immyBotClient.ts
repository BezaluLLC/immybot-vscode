// Removed unused vscode import flagged by oxlint

export class ResponseError extends Error {
	public static is(e: unknown, statusCode: number): e is ResponseError {
		return e instanceof ResponseError && e.response.status === statusCode;
	}

	constructor(public readonly response: Response, public readonly body: string) {
		super(`${response.status} ${response.statusText} from ${response.url}: ${body}`);
	}
}
export class ImmyBotClient {
	constructor(private instanceUrl: string = 'http://localhost:5000', private accessToken?: string) { }

	public setAccessToken(token: string) {
		this.accessToken = token;
	}

	public async fetchJson<T>(route: string, params?: RequestInit): Promise<T | null> {
		const response = await this.fetch(route, params);
		if (!response) {
			return null;
		}
		return await response.json();
	}
	
	private async fetch(route: string, params: RequestInit = {}) {
		const routeToFetch = route.startsWith('https:') || route.startsWith('http:') ? route : this.instanceUrl + route;
		
		// Add authorization header if we have an access token
		const headers = new Headers(params.headers);
		if (this.accessToken) {
			headers.set('Authorization', `Bearer ${this.accessToken}`);
		}
		headers.set('Content-Type', 'application/json');
		
		const requestParams = {
			...params,
			headers
		};
		
		try {
			// Log the request with headers for debugging
			const headersObj: Record<string, string> = {};
			headers.forEach((value, key) => {
				headersObj[key] = value;
			});
			const response = await fetch(routeToFetch, requestParams);
			if (!response.ok) {
				let body: string;
				try {
					body = await response.text();
					throw new ResponseError(response, body);
				} catch (e) {
					body = '<unreadable>';
					throw e;
				}
			}
			return response;
		}
		catch (exceptionVar) {
			return null;
		}
	}
}