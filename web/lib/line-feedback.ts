// Only these fixed values may travel through the redirect and into the UI.
const messages = {
  "line-state":
    "LINE ログインの有効期限が切れたか、開始したブラウザと異なります。元のブラウザで LINE ボタンからやり直してください。",
  "line-denied":
    "LINE の認証がキャンセルされました。続けるには LINE ボタンを押して認証を許可してください。",
  "line-code":
    "LINE から認証コードが届きませんでした。LINE ボタンからやり直してください。",
  "line-enrollment":
    "メール確認の有効期限が切れたか、別のブラウザで開かれました。登録ページで新しいメールを受け取り、同じブラウザで連携してください。",
  "line-exchange":
    "LINE の認証コードを交換できませんでした。LINE ボタンからやり直し、繰り返す場合は管理者にご連絡ください。",
  "line-verification":
    "LINE で本人確認を完了できませんでした。LINE ボタンからやり直し、繰り返す場合は管理者にご連絡ください。",
  "line-conflict":
    "この登録には選んだ LINE アカウントを連携できません。登録時のアカウントでログインするか、管理者にご連絡ください。",
  "line-account":
    "この LINE アカウントではログインできません。初めての方はメールで登録し、登録済みの方は管理者にご確認ください。",
  "line-initialize":
    "アカウント連携後のイベント準備に失敗しました。同じ LINE アカウントで再度ログインし、繰り返す場合は管理者にご連絡ください。",
  "line-internal":
    "サーバーで LINE ログインを完了できませんでした。しばらくしてやり直し、繰り返す場合は管理者にご連絡ください。",
  provider: "アカウント認証を完了できませんでした。もう一度お試しください。",
};
export type LineReason = Exclude<keyof typeof messages, "provider">;
export function knownReason(value: unknown): keyof typeof messages | undefined {
  return typeof value === "string" && Object.hasOwn(messages, value)
    ? (value as keyof typeof messages)
    : undefined;
}
export function recoveryMessage(reason?: keyof typeof messages) {
  return reason ? messages[reason] : "";
}
