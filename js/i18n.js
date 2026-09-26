/* i18n.js — English / Japanese switching.
   Default language is English. The choice is remembered per browser (localStorage) so it
   survives reloads; nothing is sent anywhere. Two layers:
   - t(key)   — static UI strings (buttons, headings, hints) declared once in DICT below,
                and applied to the DOM via data-i18n / data-i18n-* attributes.
   - tf(field) — a {en, ja} object used inline in data arrays (filter names, chip labels).
   - L(en, ja) — inline pick, for messages built with template values (statuses, errors). */

const STORAGE_KEY = 'slideburst.lang';
const DEFAULT_LANG = 'en';

let lang = DEFAULT_LANG;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'en' || saved === 'ja') lang = saved;
} catch (e) { /* private browsing / storage disabled: stay on the default */ }

const listeners = new Set();

export function getLang() {
  return lang;
}

export function setLang(next) {
  if (next !== 'en' && next !== 'ja') return;
  if (next === lang) return;
  lang = next;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* not persisted this session */ }
  document.documentElement.lang = lang;
  applyI18n();
  listeners.forEach((cb) => cb(lang));
}

/* Runs cb now is NOT implied — cb only fires on future switches. Callers that build
   language-dependent UI (chips, dynamic labels) register here so a language switch
   re-renders them. */
export function onLangChange(cb) {
  listeners.add(cb);
}

/* Pick the current language's string from a {en, ja} field. Passing a plain string
   returns it unchanged (so untranslated/neutral values — "4:3", hex colors, ids — pass
   straight through the same call sites as translated ones). */
export function tf(field) {
  if (field == null) return '';
  if (typeof field === 'string') return field;
  return field[lang] || field.en || field.ja || '';
}

/* Inline pick for messages assembled with template values, kept next to the call site
   instead of a named dictionary key (most of these strings are one-off and full of
   interpolated numbers, so a flat key table would just add a layer of indirection). */
export function L(en, ja) {
  return lang === 'ja' ? ja : en;
}

/* Static dictionary for data-i18n-bound DOM text. English is also the literal text
   already sitting in index.html, so English needs no lookup; only ja is listed here. */
const DICT = {
  'app.title': { en: 'SLIDEBURST — moving 3D photo camera', ja: 'SLIDEBURST — 動く立体写真カメラ' },
  'app.description': {
    en: 'A quick sideways slide turns a still moment into a 3D-looking loop. A multi-view loop camera shot with one iPhone lens.',
    ja: '一瞬の横移動で、止まった人が立体的に動き出す。iPhoneの1眼で撮る多視点ループカメラ。'
  },
  'env.checking': { en: 'Checking your environment…', ja: '環境を確認中…' },
  'env.rvfcSupported': { en: 'rVFC supported', ja: 'rVFC 対応' },
  'env.rvfcUnsupported': { en: 'rVFC not supported', ja: 'rVFC 非対応' },
  'env.noVideoExport': { en: 'video export unavailable', ja: '動画書き出し不可' },
  'env.noStorage': { en: 'saving unavailable', ja: '保存不可' },
  'env.notHttps': { en: 'camera unavailable — page is not served over HTTPS', ja: 'HTTPSでないためカメラを使えません' },

  'camera.slideGuide': { en: 'Slide the camera sideways, level', ja: 'カメラを水平に横へ滑らせる' },
  'camera.cancel': { en: 'Cancel', ja: 'キャンセル' },
  'camera.blockerText': { en: 'Start the camera to begin shooting.', ja: 'カメラを起動すると撮影できます。' },
  'camera.start': { en: 'Start camera', ja: 'カメラを起動' },
  'camera.flipLabel': { en: 'Switch between front and back camera', ja: 'インカメラとアウトカメラを切り替え' },
  'camera.out': { en: 'Back', ja: 'アウト' },
  'camera.works': { en: 'Works', ja: '作品' },
  'camera.mode': { en: 'Capture mode', ja: '撮影モード' },
  'camera.duration': { en: 'Capture time', ja: '撮影時間' },
  'camera.selfTimer': { en: 'Self-timer', ja: 'セルフタイマー' },
  'camera.guide': { en: 'Framing guide (doesn\u2019t change what\u2019s captured)', ja: '構図ガイド（撮影範囲は変わりません）' },
  'camera.recResolution': { en: 'Recording resolution', ja: '記録解像度' },
  'camera.resSensor': { en: 'Sensor output, as-is', ja: 'センサー出力のまま' },
  'camera.resRecommended': { en: '50% (recommended)', ja: '50%（おすすめ）' },
  'camera.streamSettings': { en: 'Stream settings', ja: 'ストリーム設定' },
  'camera.streamFps': { en: 'Frame rate priority — 1280\u00d7720 / 60', ja: 'フレームレート優先 1280×720 / 60' },
  'camera.streamRes': { en: 'Resolution priority — 1920\u00d71080 / 30', ja: '解像度優先 1920×1080 / 30' },
  'camera.streamMax': { en: 'No limit (device decides)', ja: '上限なし（端末まかせ）' },

  'result.retake': { en: 'Retake', ja: '撮り直す' },
  'result.stop': { en: 'Stop', ja: '停止' },
  'result.play': { en: 'Play', ja: '再生' },
  'result.saveShare': { en: 'Save & share', ja: '保存・共有' },
  'tab.play': { en: 'Play', ja: '再生' },
  'tab.look': { en: 'Look', ja: '加工' },
  'tab.text': { en: 'Text', ja: 'テキスト' },
  'tab.draw': { en: 'Draw', ja: '落書き' },
  'tab.save': { en: 'Save', ja: '保存' },
  'tab.lib': { en: 'Library', ja: '作品' },
  'tab.data': { en: 'Diagnostics', ja: '検証' },

  'play.frameCount': { en: 'Frames used', ja: '使うコマ数' },
  'play.speed': { en: 'Playback speed', ja: '再生速度' },
  'play.pingpong': { en: 'Ping-pong playback (1\u2192N\u21922)', ja: '往復再生（1→N→2）' },
  'play.position': { en: 'Position', ja: '再生位置' },
  'play.prevFrame': { en: '\u25c0 Previous frame', ja: '◀ 前のコマ' },
  'play.nextFrame': { en: 'Next frame \u25b6', ja: '次のコマ ▶' },
  'play.soundOn': { en: 'Play with sound', ja: '音を出して再生する' },
  'play.scrub': { en: 'Scrub', ja: 'コマ送り' },
  'play.prev': { en: '\u25c0 Prev', ja: '◀ 前' },
  'play.next': { en: 'Next \u25b6', ja: '次 ▶' },
  'play.aspect': { en: 'Aspect ratio', ja: '作品の縦横比' },
  'play.cropOffset': { en: 'Crop position', ja: '切り出す位置' },
  'play.cropHint': { en: 'The original frames stay untouched, so you can re-crop anytime.', ja: '元のフレームはそのまま残るので、あとから何度でも切り直せます。' },

  'look.filter': { en: 'Filter', ja: 'フィルター' },
  'look.intensity': { en: 'Filter strength', ja: 'フィルターの強さ' },
  'look.advanced': { en: 'Fine-tune', ja: 'くわしく調整する' },
  'look.advancedSimple': { en: 'Back to simple mode', ja: 'かんたん設定に戻す' },
  'look.advancedTitle': { en: 'Fine settings', ja: 'くわしい設定' },
  'look.colorMode': { en: 'Color process', ja: '色の方式' },
  'look.advancedReset': { en: 'Reset to strength control', ja: '強さの設定に戻す' },
  'look.crt': { en: 'CRT television', ja: 'ブラウン管' },
  'look.crtToggle': { en: 'Show on a CRT television', ja: 'ブラウン管テレビに映す' },
  'look.crtStrength': { en: 'Strength', ja: '強さ' },
  'look.crtHint': { en: 'Combine with VHS or Hi8 for a played-back-on-TV feel. Pairs well with 4:3.', ja: 'VHS や Hi8 と重ねると、テレビで再生した映像のようになります。4:3 と相性がよいです。' },

  'text.hint': { en: 'Anything you add here sits underneath the filter and CRT layers — VHS noise runs over it, and CRT curvature bends it too.', ja: 'ここで入れた文字は、フィルターやブラウン管の「下」に敷かれます。VHSのノイズがかかり、ブラウン管の湾曲にそって曲がります。' },
  'text.dateStamp': { en: 'Date stamp', ja: '日付の焼き込み' },
  'text.show': { en: 'Show', ja: '表示する' },
  'text.dateHint': { en: 'Digits are rendered in the same 7-segment style old cameras used. The text itself is free to edit.', ja: '数字は当時のカメラと同じ7セグメント表示で焼き込まれます。文字は自由に書き換えられます。' },
  'text.vhsText': { en: 'VHS-style text', ja: 'VHS風の文字' },
  'text.showTitle': { en: 'Show title', ja: 'タイトルを表示する' },
  'text.titlePlaceholder': { en: 'Enter a title', ja: 'タイトルを入力' },
  'text.font': { en: 'Font', ja: 'フォント' },
  'text.color': { en: 'Text color', ja: '文字の色' },
  'text.size': { en: 'Text size', ja: '文字の大きさ' },
  'text.outline': { en: 'Outline', ja: '縁取りする' },
  'text.outlineWidth': { en: 'Outline thickness', ja: '縁取りの太さ' },
  'text.dragHint': { en: 'Drag the title anywhere on the preview to move it.', ja: 'タイトルは、プレビューをなぞると好きな位置へ動かせます。' },
  'text.resetPosition': { en: 'Reset title position', ja: 'タイトルの位置を初期位置に戻す' },
  'text.showPlay': { en: 'Show \u201c\u25b6 PLAY\u201d top-left', ja: '左上に「▶ PLAY」を表示する' },
  'text.showCounter': { en: 'Show tape counter bottom-right', ja: '右下にテープカウンターを表示する' },
  'text.overlayHint': { en: 'Overlays text the way an old VCR burned it onto tape. The counter reads \u201c0:00:00\u201d (h:mm:ss) and actually advances during playback and export.', ja: '当時のビデオデッキがテープに焼き込んでいたような文字を、映像に重ねます。カウンターは「0:00:00」（時:分:秒）で、再生・書き出しのあいだ実際に進みます。' },

  'draw.hint': { en: 'Draw right on the preview. Whatever you draw appears on every frame.', ja: 'プレビューの上に直接描けます。描いたものは全コマに乗ります。' },
  'draw.size': { en: 'Size', ja: '太さ' },
  'draw.undo': { en: 'Undo', ja: 'ひとつ戻す' },
  'draw.clear': { en: 'Clear all', ja: '全部消す' },

  'save.format': { en: 'Format', ja: '形式' },
  'save.videoLength': { en: 'Video length', ja: '動画の長さ' },
  'save.exportFrame': { en: 'Export frame', ja: '書き出し枠' },
  'save.frameHint': { en: 'Your work is fit inside this frame without cropping it. The original work is unchanged.', ja: '作品は切らずに、この枠の中へ収めます。元の作品は変わりません。' },
  'save.size': { en: 'Size', ja: 'サイズ' },
  'save.sizeLight': { en: '480px (lighter)', ja: '480px（軽い）' },
  'save.sizeStandard': { en: '720px (standard)', ja: '720px（標準）' },
  'save.sizeOriginal': { en: 'Original', ja: '元のまま' },
  'save.exportBtn': { en: 'Create & save / share', ja: '作って保存・共有' },
  'save.exportCancel': { en: 'Cancel export', ja: '書き出しを中止' },
  'save.download': { en: 'Download', ja: 'ダウンロード' },
  'save.share': { en: 'Share & save to photos', ja: '共有して写真に保存' },

  'lib.note': { en: 'Saved works stay on this device only. Nothing is sent anywhere.', ja: '撮った作品はこの端末の中だけに保存されます。どこにも送信されません。' },

  'data.framesTitle': { en: 'Captured frames', ja: '取得フレーム' },
  'data.metricsTitle': { en: 'Measurements', ja: '計測結果' },
  'data.copy': { en: 'Copy measurements', ja: '計測結果をコピー' },

  'footer.copyright': { en: '\u00a9 2026 egoaid', ja: '© 2026 egoaid' },

  'lang.label': { en: 'Language', ja: '言語' }
};

export function t(key) {
  const entry = DICT[key];
  if (!entry) return key;
  return entry[lang] || entry.en;
}

/* Applies the dictionary to every element carrying data-i18n / data-i18n-<attr>.
   Called on load and after every language switch. */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
  document.documentElement.lang = lang;
}
