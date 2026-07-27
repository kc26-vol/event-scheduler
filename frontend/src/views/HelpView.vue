<template>
        <div class="panel active">
            <h2>利用方法</h2>

            <div style="max-width:960px">
                <!-- 概要 -->
                <div style="background:#e3f2fd;border-radius:8px;padding:20px;margin-bottom:24px">
                    <h3 style="margin:0 0 8px;color:#1565c0">Event Schedulerとは</h3>
                    <p style="margin:0;font-size:0.95rem;color:#333;line-height:1.7">イベントやカンファレンスの運営に必要な、部屋・セッション・スタッフの管理と配置を一元的に行えるツールです。データはすべてサーバー上に保存され、複数人で同時にアクセスできます。</p>
                </div>

                <!-- 推奨ワークフロー -->
                <div style="margin-bottom:32px">
                    <h3 style="margin:0 0 16px;color:#333;border-bottom:2px solid #1a73e8;padding-bottom:8px">推奨ワークフロー</h3>
                    <div style="display:flex;flex-direction:column;gap:2px">
                        <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:#fafafa;border-radius:6px">
                            <span style="background:#1a73e8;color:#fff;border-radius:50%;min-width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem">1</span>
                            <div><strong>部屋管理</strong>で会場の部屋を登録（名前・定員・階数）</div>
                        </div>
                        <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:#fafafa;border-radius:6px">
                            <span style="background:#1a73e8;color:#fff;border-radius:50%;min-width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem">2</span>
                            <div><strong>会場地図</strong>で会場のフロアマップ画像を登録</div>
                        </div>
                        <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:#fafafa;border-radius:6px">
                            <span style="background:#1a73e8;color:#fff;border-radius:50%;min-width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem">3</span>
                            <div><strong>設定</strong>でカテゴリ・セッショングループを必要に応じて追加（受付案内・懇親会など）</div>
                        </div>
                        <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:#fafafa;border-radius:6px">
                            <span style="background:#1a73e8;color:#fff;border-radius:50%;min-width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem">4</span>
                            <div><strong>全体スケジュール管理</strong>で全スタッフ共通のスケジュールを登録（集合・開場・昼休み・閉会など）</div>
                        </div>
                        <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:#fafafa;border-radius:6px">
                            <span style="background:#1a73e8;color:#fff;border-radius:50%;min-width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem">5</span>
                            <div><strong>セッション管理</strong>でセッションを登録（タイトル・登壇者情報・時間・部屋・カテゴリ）</div>
                        </div>
                        <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:#fafafa;border-radius:6px">
                            <span style="background:#1a73e8;color:#fff;border-radius:50%;min-width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem">6</span>
                            <div><strong>カテゴリ別管理</strong>（受付案内管理・懇親会管理など）で各カテゴリのセッションを登録</div>
                        </div>
                        <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:#fafafa;border-radius:6px">
                            <span style="background:#1a73e8;color:#fff;border-radius:50%;min-width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem">7</span>
                            <div><strong>スタッフ管理</strong>でスタッフを登録（担当ロール・英語対応・稼働時間・経験回数・活動可能時間・希望セッション）</div>
                        </div>
                        <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:#fafafa;border-radius:6px">
                            <span style="background:#1a73e8;color:#fff;border-radius:50%;min-width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem">8</span>
                            <div><strong>各担当タブ</strong>（セッション担当・受付案内担当・懇親会担当など）でスタッフ自動配置を実行し、必要に応じて手動調整</div>
                        </div>
                        <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:#fafafa;border-radius:6px">
                            <span style="background:#1a73e8;color:#fff;border-radius:50%;min-width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem">9</span>
                            <div><strong>全体スケジュール</strong>・<strong>スタッフ別詳細</strong>で全体の確認。<strong>エクスポート</strong>でExcel出力・バックアップ</div>
                        </div>
                        <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:#fafafa;border-radius:6px">
                            <span style="background:#1a73e8;color:#fff;border-radius:50%;min-width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem">10</span>
                            <div><strong>公開API</strong>でスケジュールをパブリッシュし、外部サイトへJSON配信。Webhook・GitHub Actions連携で自動更新も可能</div>
                        </div>
                    </div>
                </div>

                <!-- ===== 閲覧系 ===== -->
                <div style="margin-bottom:32px">
                    <h3 style="margin:0 0 16px;color:#333;border-bottom:2px solid #1a73e8;padding-bottom:8px">閲覧・確認</h3>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#1565c0">全体スケジュール</h4>
                        <p style="margin:0 0 8px;font-size:0.9rem;color:#555;line-height:1.7">全カテゴリ・全部屋のタイムテーブルを一画面に表示します。日付タブで日ごとに切り替え、スタッフ絞り込みで特定スタッフの担当を確認できます。</p>
                        <ul style="margin:0;padding-left:20px;font-size:0.88rem;color:#444;line-height:1.8">
                            <li>セッションをクリックすると詳細ポップアップが開きます</li>
                            <li>全体スケジュール（overall）のセッションは「全員」または個別スタッフ配置が表示されます</li>
                            <li>凡例でカテゴリごとの色分けを確認できます</li>
                        </ul>
                    </div>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#1565c0">スタッフ別詳細</h4>
                        <p style="margin:0 0 8px;font-size:0.9rem;color:#555;line-height:1.7">スタッフごとの担当セッション一覧を表示します。プロフィール写真・アカウント名・担当ロール・経験回数・活動可能時間とともに確認できます。</p>
                        <ul style="margin:0;padding-left:20px;font-size:0.88rem;color:#444;line-height:1.8">
                            <li>「全員」に設定された全体スケジュールは自動的に全スタッフの担当に含まれます</li>
                            <li>同一時間帯のセッションは 全体 → セッション → カテゴリ順 で表示されます</li>
                            <li>スタッフ絞り込みで特定のスタッフのみ表示できます</li>
                        </ul>
                    </div>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#1565c0">会場</h4>
                        <p style="margin:0;font-size:0.9rem;color:#555;line-height:1.7">登録済みの会場地図を一覧表示します。画像をクリックすると拡大表示されます。</p>
                    </div>
                </div>

                <!-- ===== イベント設定 ===== -->
                <div style="margin-bottom:32px">
                    <h3 style="margin:0 0 16px;color:#333;border-bottom:2px solid #e65100;padding-bottom:8px">イベント設定</h3>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#e65100">全体スケジュール管理</h4>
                        <p style="margin:0 0 8px;font-size:0.9rem;color:#555;line-height:1.7">全スタッフ共通の予定を登録します。スタッフ集合・開場・昼休み・閉会挨拶などのイベント全体に関わるスケジュールです。</p>
                        <ul style="margin:0;padding-left:20px;font-size:0.88rem;color:#444;line-height:1.8">
                            <li>タイトル・開始/終了時刻・備考を設定</li>
                            <li>必要スタッフ数や登壇者情報は不要です</li>
                            <li>全体スケジュールマトリクスの「全体」列に表示されます</li>
                        </ul>
                    </div>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#e65100">セッション管理（セッショングループ別）</h4>
                        <p style="margin:0 0 8px;font-size:0.9rem;color:#555;line-height:1.7">セッショングループごとにセッションを登録・編集します。セッショングループは設定ページで追加でき、Day 1 / Day 2 のような論理的なグループ分けに使用します。</p>
                        <ul style="margin:0;padding-left:20px;font-size:0.88rem;color:#444;line-height:1.8">
                            <li><strong>基本情報</strong>: タイトル・登壇者名・ふりがな・開始/終了時刻・部屋・カテゴリ</li>
                            <li><strong>登壇者詳細</strong>: 所属・肩書き・プロフィール・写真アップロード</li>
                            <li><strong>カテゴリ</strong>: 一般・ワークショップ・基調講演・LT・パネルディスカッション から選択</li>
                            <li><strong>LT・パネルディスカッション</strong>: カテゴリを「LT」または「パネルディスカッション」にすると登壇者を個別に追加可能。各登壇者に開始/終了時刻・写真を設定</li>
                            <li><strong>必要スタッフ数</strong>: 手動入力または「必要スタッフ計算」で部屋定員から推奨値を算出</li>
                            <li><strong>英語対応</strong>: チェックすると英語対応可能なスタッフが優先配置されます</li>
                            <li>日付タブはセッションの日付から自動生成されます</li>
                        </ul>
                    </div>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#e65100">カテゴリ別管理（受付案内・懇親会など）</h4>
                        <p style="margin:0 0 8px;font-size:0.9rem;color:#555;line-height:1.7">設定で追加した動的カテゴリのセッション管理です。受付案内・懇親会・デモなど、セッションとは別のテンプレートで管理されます。</p>
                        <ul style="margin:0;padding-left:20px;font-size:0.88rem;color:#444;line-height:1.8">
                            <li>タイトル・開始/終了時刻・部屋・必要スタッフ数・英語対応・備考を設定</li>
                            <li>登壇者情報やLT機能はありません</li>
                            <li>日付タブはそのカテゴリのセッション日付から自動生成されます</li>
                        </ul>
                    </div>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#e65100">スタッフ管理</h4>
                        <p style="margin:0 0 8px;font-size:0.9rem;color:#555;line-height:1.7">運営スタッフの登録・編集を行います。</p>
                        <ul style="margin:0;padding-left:20px;font-size:0.88rem;color:#444;line-height:1.8">
                            <li><strong>基本情報</strong>: 名前・アカウント名（@自動付与）・プロフィール写真</li>
                            <li><strong>担当ロール</strong>: セッション・受付案内・懇親会などの担当可能なロールを選択（複数選択可）。自動配置時にロールに基づいて適切なセッションに配置されます</li>
                            <li><strong>英語対応</strong>: 英語セッションに優先配置されます</li>
                            <li><strong>最大稼働時間</strong>: 1日の最大稼働時間を設定。自動配置時にこの時間を超えないよう調整されます</li>
                            <li><strong>過去参加回数</strong>: 0回が初参加。初参加スタッフは経験者と一緒に配置されます</li>
                            <li><strong>活動可能時間</strong>: スタッフの対応可能な時間帯を設定。この時間帯のセッションのみ配置対象になります</li>
                            <li><strong>希望セッション</strong>: 担当したいセッションを優先度付きで登録。自動配置時に考慮されます</li>
                        </ul>
                    </div>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#e65100">部屋管理</h4>
                        <p style="margin:0 0 8px;font-size:0.9rem;color:#555;line-height:1.7">会場の部屋を登録・編集・削除します。</p>
                        <ul style="margin:0;padding-left:20px;font-size:0.88rem;color:#444;line-height:1.8">
                            <li><strong>名前</strong>: 部屋名（メインホール、Room Aなど）</li>
                            <li><strong>定員</strong>: 収容人数。「必要スタッフ計算」の基準値に使用</li>
                            <li><strong>階数</strong>: 自動配置で階移動ペナルティに使用。連続セッションで階が異なるスタッフは減点されます</li>
                        </ul>
                    </div>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#e65100">会場地図</h4>
                        <p style="margin:0;font-size:0.9rem;color:#555;line-height:1.7">会場のフロアマップ画像を登録します。名前（必須）と画像ファイルをアップロードします。「会場」タブや受付案内の印刷物で表示されます。</p>
                    </div>
                </div>

                <!-- ===== スタッフ配置 ===== -->
                <div style="margin-bottom:32px">
                    <h3 style="margin:0 0 16px;color:#333;border-bottom:2px solid #388e3c;padding-bottom:8px">スタッフ配置</h3>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#388e3c">全体スケジュール担当</h4>
                        <p style="margin:0 0 8px;font-size:0.9rem;color:#555;line-height:1.7">全体スケジュールのセッションへのスタッフ配置を管理します。</p>
                        <ul style="margin:0;padding-left:20px;font-size:0.88rem;color:#444;line-height:1.8">
                            <li><strong>全員</strong>: 担当スタッフの「＋追加」から「全員」を選択すると、全スタッフが対象のセッションとして表示されます。個別にスタッフを登録する必要はありません</li>
                            <li>「全員」設定は解除ボタン（x）で個別配置に戻せます</li>
                            <li>ロック/編集切替でスタッフの追加・削除を制御できます</li>
                            <li>タイムライン表示と一覧表示で確認できます</li>
                        </ul>
                    </div>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#388e3c">セッション担当（セッショングループ別）</h4>
                        <p style="margin:0 0 8px;font-size:0.9rem;color:#555;line-height:1.7">セッショングループごとのスタッフ配置を管理します。</p>
                        <ul style="margin:0;padding-left:20px;font-size:0.88rem;color:#444;line-height:1.8">
                            <li><strong>自動配置</strong>: 「スタッフ自動配置」ボタンで一括配置。セッションを選択して「選択して再配置」で部分的な再配置も可能</li>
                            <li><strong>手動配置</strong>: ロックを解除し、各セッションの「＋追加」からスタッフを個別に追加</li>
                            <li><strong>配置クリア</strong>: 現在の配置をすべて解除</li>
                            <li>ドラッグ&ドロップでセッションの時間・部屋を変更可能</li>
                            <li>スタッフ絞り込みで特定スタッフの配置状況を確認できます</li>
                        </ul>
                    </div>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#388e3c">カテゴリ別担当（受付案内・懇親会など）</h4>
                        <p style="margin:0;font-size:0.9rem;color:#555;line-height:1.7">動的カテゴリのセッションへのスタッフ配置です。セッション担当と同じ操作で自動配置・手動配置が可能です。スタッフの「担当ロール」に該当カテゴリが含まれているスタッフのみが配置対象になります。</p>
                    </div>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#388e3c">配置アルゴリズム</h4>
                        <p style="margin:0 0 8px;font-size:0.9rem;color:#555;line-height:1.7">自動配置アルゴリズムの仕組みを説明するページです。以下の要素を総合的にスコアリングして最適配置を算出します。</p>
                        <ul style="margin:0;padding-left:20px;font-size:0.88rem;color:#444;line-height:1.8">
                            <li><strong>ロールマッチ</strong>: スタッフの担当ロールとセッションカテゴリの一致</li>
                            <li><strong>希望セッション</strong>: 高優先度の希望ほど高スコア</li>
                            <li><strong>英語対応</strong>: 英語セッションには英語対応スタッフを優先</li>
                            <li><strong>担当均等化</strong>: 担当件数・合計担当時間が少ないスタッフを優先</li>
                            <li><strong>階移動ペナルティ</strong>: 連続セッションの階差が大きいほど減点</li>
                            <li><strong>活動可能時間</strong>: 設定された時間帯のみ配置対象</li>
                            <li><strong>最大稼働時間</strong>: 超過しないよう制御</li>
                            <li><strong>初参加者保護</strong>: 初参加スタッフは経験者と一緒に配置</li>
                        </ul>
                    </div>
                </div>

                <!-- ===== 公開API ===== -->
                <div style="margin-bottom:32px">
                    <h3 style="margin:0 0 16px;color:#333;border-bottom:2px solid #ff6f00;padding-bottom:8px">公開API</h3>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#ff6f00">概要</h4>
                        <p style="margin:0;font-size:0.9rem;color:#555;line-height:1.7">イベント公式サイト等の外部サイトからスケジュールデータをJSON形式で取得できるAPIを提供します。「パブリッシュ」で確定したスナップショットのみが公開されるため、編集中のデータは外部に漏れません。</p>
                    </div>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#ff6f00">API設定</h4>
                        <ul style="margin:0;padding-left:20px;font-size:0.88rem;color:#444;line-height:1.8">
                            <li><strong>有効/無効</strong>: 公開APIの有効・無効を切り替え。初回有効化時にAPIキーが自動生成されます</li>
                            <li><strong>APIキー</strong>: クエリパラメータ <code>?key=</code> またはヘッダー <code>X-API-Key</code> で認証に使用。コピー・再生成が可能</li>
                            <li><strong>CORSオリジン</strong>: <code>*</code>（全許可）またはカンマ区切りで許可するオリジンを指定</li>
                        </ul>
                    </div>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#ff6f00">パブリッシュ</h4>
                        <ul style="margin:0;padding-left:20px;font-size:0.88rem;color:#444;line-height:1.8">
                            <li>「パブリッシュ」ボタンで現在のスケジュールデータをスナップショットとして保存・公開</li>
                            <li>パブリッシュ履歴から過去のスナップショットをアクティブに切り替え可能</li>
                            <li>アクティブでないスナップショットは削除可能</li>
                        </ul>
                    </div>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#ff6f00">Webhook</h4>
                        <p style="margin:0;font-size:0.9rem;color:#555;line-height:1.7">パブリッシュ時に指定URLへPOSTリクエストを送信します。外部サイトのキャッシュ更新トリガー等に利用できます。送信失敗時もパブリッシュは成功します。</p>
                    </div>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#ff6f00">GitHub Actions連携</h4>
                        <ul style="margin:0;padding-left:20px;font-size:0.88rem;color:#444;line-height:1.8">
                            <li>パブリッシュ時に <code>workflow_dispatch</code> を実行し、GitHub Pages等のキャッシュを自動更新</li>
                            <li>スケジュールAPIのURLは <code>inputs.schedule_url</code> としてワークフローに自動で渡されます</li>
                            <li><strong>Dispatch URL</strong>: <code>https://api.github.com/repos/{owner}/{repo}/actions/workflows/{file}/dispatches</code></li>
                            <li><strong>Personal Access Token</strong>: Fine-grained PAT。必要な権限は <strong>Actions: Read and write</strong></li>
                            <li>実行失敗時もパブリッシュは成功します</li>
                        </ul>
                    </div>
                </div>

                <!-- ===== 出力 ===== -->
                <div style="margin-bottom:32px">
                    <h3 style="margin:0 0 16px;color:#333;border-bottom:2px solid #7b1fa2;padding-bottom:8px">出力</h3>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#7b1fa2">エクスポート</h4>
                        <ul style="margin:0;padding-left:20px;font-size:0.9rem;color:#444;line-height:2">
                            <li><strong>Excelエクスポート</strong>: 部屋管理・セッション管理・スタッフ管理・セッション配置・全体スケジュールマトリクス・カテゴリ別シートを含むExcelファイルを出力。登壇者写真も埋め込まれます</li>
                            <li><strong>connpassタイムライン</strong>: connpassイベントページに貼り付け可能なMarkdown形式のタイムテーブルを生成。ベースURLを設定すると登壇者写真のリンクも含まれます</li>
                            <li><strong>connpass登壇者テンプレート</strong>: connpassイベントページ用の登壇者一覧をMarkdown形式で生成</li>
                        </ul>
                    </div>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#7b1fa2">バックアップ</h4>
                        <ul style="margin:0;padding-left:20px;font-size:0.9rem;color:#444;line-height:2">
                            <li><strong>手動バックアップ</strong>: 全データと画像ファイルをZIP形式でエクスポート。別環境への移行やデータ保全に使用します</li>
                            <li><strong>バックアップ復元</strong>: エクスポートしたZIPファイルからデータを復元。既存データはすべて上書きされます</li>
                            <li><strong>自動バックアップ</strong>: 一定間隔（分単位）または毎日指定時刻に自動でバックアップを実行。保持件数を超えると古いバックアップから自動削除されます</li>
                            <li><strong>バックアップ履歴</strong>: 過去のバックアップ一覧を表示。個別にダウンロード・削除が可能です</li>
                        </ul>
                    </div>
                </div>

                <!-- ===== システム ===== -->
                <div style="margin-bottom:32px">
                    <h3 style="margin:0 0 16px;color:#333;border-bottom:2px solid #d32f2f;padding-bottom:8px">システム</h3>

                    <div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <h4 style="margin:0 0 8px;color:#d32f2f">設定</h4>
                        <ul style="margin:0;padding-left:20px;font-size:0.9rem;color:#444;line-height:2">
                            <li><strong>タイトル設定</strong>: アプリのヘッダータイトルを変更</li>
                            <li><strong>カテゴリ管理</strong>: 受付案内・懇親会・デモなどのカスタムカテゴリを追加・編集・削除。表示名・色・順序を設定。セッションが紐づいているカテゴリは削除できません</li>
                            <li><strong>セッショングループ管理</strong>: セッションの論理グループを追加・編集・削除。日付・表示名・色・順序を設定。サイドバーにグループごとの管理・担当タブが自動追加されます</li>
                            <li><strong>順序</strong>: 追加時は自動で末尾に設定。既存の順序を指定すると、その位置に挿入され他の項目は自動的にずれます</li>
                            <li><strong>パスワード変更</strong>: 管理者パスワードを変更</li>
                            <li><strong>全データ初期化</strong>: パスワードを入力してすべてのデータを削除。事前にバックアップを取ってください</li>
                        </ul>
                    </div>
                </div>

                <!-- セッション詳細ポップアップ -->
                <div style="margin-bottom:32px">
                    <h3 style="margin:0 0 16px;color:#333;border-bottom:2px solid #666;padding-bottom:8px">セッション詳細ポップアップ</h3>
                    <div style="border:1px solid #e0e0e0;border-radius:8px;padding:16px">
                        <p style="margin:0 0 8px;font-size:0.9rem;color:#555;line-height:1.7">セッション名をクリックすると表示される詳細ポップアップでは、以下の情報を確認・操作できます。</p>
                        <ul style="margin:0;padding-left:20px;font-size:0.88rem;color:#444;line-height:1.8">
                            <li>セッション基本情報（タイトル・時間・部屋・カテゴリ・必要人数）</li>
                            <li>登壇者情報（写真・名前・所属・肩書き・プロフィール）※全体セッションを除く</li>
                            <li>LT登壇者・パネリスト一覧（LT・パネルディスカッションの場合）</li>
                            <li>セッション説明・備考</li>
                            <li>担当スタッフの確認・追加・削除（ロック解除時）</li>
                            <li>全体セッションの場合は「全員」の設定・解除が可能</li>
                        </ul>
                    </div>
                </div>

                <!-- Tips -->
                <div style="margin-bottom:28px">
                    <h3 style="margin:0 0 12px;color:#333;border-bottom:2px solid #666;padding-bottom:8px">Tips</h3>
                    <ul style="margin:0;padding-left:20px;font-size:0.92rem;line-height:2.2;color:#444">
                        <li>各担当タブの<strong>ロック/編集切替</strong>で誤操作を防止できます。ロック中は配置の変更ができません</li>
                        <li>アカウント名は入力時に<strong>@が自動付与</strong>されます（例: tanaka → @tanaka）</li>
                        <li>登壇者・スタッフの写真は<strong>選択時にプレビュー表示</strong>され、保存時にアップロードされます</li>
                        <li>開始時刻を設定すると<strong>終了時刻が自動計算</strong>されます（セッション: +1時間、LT: +5分）</li>
                        <li><strong>バックアップは定期的に</strong>エクスポートすることを推奨します。ZIPにはすべてのデータと画像が含まれます</li>
                        <li>データの初期化は<strong>元に戻せません</strong>。必ずバックアップを取ってから実行してください</li>
                    </ul>
                </div>
            </div>
        </div>
</template>

<script>
import { useStore } from '../store'

export default {
    setup() {
        return useStore()
    },
}
</script>
