// ================================================================
// SanctuaryApp.swift
// Urban Noise Sanctuary — アプリエントリーポイント
//
// 【Xcodeプロジェクトへの追加手順】
//  1. Xcode > File > New > Project > iOS > App を選択
//  2. Product Name: UNS-iOS / Interface: SwiftUI / Language: Swift
//  3. 既存の ContentView.swift を削除
//  4. このフォルダの .swift ファイルをドラッグ＆ドロップ
//     （Copy items if needed にチェック）
//  5. ▶ ビルドして完成
//
// 【最低要件】
//  - iOS 16.0+
//  - Xcode 15+
// ================================================================

import SwiftUI

@main
struct SanctuaryApp: App {
    var body: some Scene {
        WindowGroup {
            SanctuaryView()
        }
    }
}
