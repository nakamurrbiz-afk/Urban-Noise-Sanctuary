# Urban Noise Sanctuary — iOS (SwiftUI)

都市の騒音を、脳の栄養に変える。  
電車移動をバイノーラル音響で「脳のトリートメント」に変える iOS アプリ。

---

## スクリーン

### Sanctuary Screen（メイン画面）

| 要素 | 実装 |
|------|------|
| シールドアニメーション | 3本のリップルリング（3.6s, 1.2s ずれ）+ グロー |
| モード選択 | Calm / Focus / Activate ピル |
| ノイズバー | 外部ノイズ（73dB）/ Sanctuary（18dB・呼吸アニメ）|
| CTA ボタン | モード連動グラデーション |

---

## デザイン言語

```
背景:       #0A0A0B  （漆黒）
Calm:       #6E8FD4 / #92AEDE
Focus:      #00A8CC / #00C8A8   ← デフォルト
Activate:   #00B87A / #4ECFA0
フォント:   SF Pro、weight 200–300（超細字）
アイコン:   Unicode記号のみ（◉ ∿ ✦ ⟡ ◈）
```

---

## ファイル構成

```
├── SanctuaryApp.swift      # アプリエントリーポイント（@main）
├── SanctuaryTheme.swift    # Color tokens + SanctuaryMode enum
├── ShieldView.swift        # リップルリング・グロー・コーナーブラケット
└── SanctuaryView.swift     # メイン画面（Badge / NoiseBars / ModePicker / CTA）
```

---

## Xcodeプロジェクトのセットアップ

```
1. Xcode → File → New → Project → iOS → App
2. Product Name: UNS-iOS
   Interface: SwiftUI  /  Language: Swift  /  Minimum: iOS 16
3. デフォルトの ContentView.swift を削除
4. このリポジトリの .swift ファイルをドラッグ＆ドロップ
   （Copy items if needed にチェック）
5. ▶ Run
```

---

## 技術要件

- **iOS 16.0 以上**
- **Xcode 15 以上**
- 外部ライブラリ: なし（SwiftUI + Foundation のみ）

---

## ロードマップ

- [x] SanctuaryScreen UI（SwiftUI）
- [ ] Route DNA Screen
- [ ] Weekly Summary Screen
- [ ] Settings Screen
- [ ] Onboarding（6ステップ）
- [ ] AVFoundation バイノーラル音響エンジン
- [ ] HealthKit HRV 連携
- [ ] CoreLocation 路線検知
