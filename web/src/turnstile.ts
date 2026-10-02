interface TurnstileApi {
	render(
		container: HTMLElement,
		options: {
			sitekey: string;
			callback: (token: string) => void;
			"expired-callback": () => void;
			"error-callback": () => void;
		},
	): string;
	reset(widgetId: string): void;
}

declare global {
	interface Window {
		turnstile?: TurnstileApi;
		onTurnstileLoad?: () => void;
	}
}

/** ローカル開発では .env.local の VITE_TURNSTILE_SITEKEY でテスト用キーに差し替える。 */
const SITEKEY =
	import.meta.env.VITE_TURNSTILE_SITEKEY ?? "0x4AAAAAAFMNXGF7-9FeiSoS";

const UNAVAILABLE =
	"ボット検証を読み込めないため変換できません。通信環境を確認してページを再読み込みしてください。";

/** ウィジェットを描画し、トークンの発行・失効を通知する。reset() で次のトークンを要求する。 */
export function mountTurnstile(
	container: HTMLElement,
	onToken: (token: string | null) => void,
	onError: (message: string) => void,
): { reset: () => void } {
	let widgetId: string | null = null;
	window.onTurnstileLoad = () => {
		widgetId =
			window.turnstile?.render(container, {
				sitekey: SITEKEY,
				callback: (token) => onToken(token),
				"expired-callback": () => onToken(null),
				"error-callback": () => {
					onToken(null);
					onError(UNAVAILABLE);
				},
			}) ?? null;
	};
	const script = document.createElement("script");
	script.src =
		"https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
	script.async = true;
	script.onerror = () => onError(UNAVAILABLE);
	document.head.append(script);
	return {
		reset() {
			onToken(null);
			if (widgetId !== null) window.turnstile?.reset(widgetId);
		},
	};
}
