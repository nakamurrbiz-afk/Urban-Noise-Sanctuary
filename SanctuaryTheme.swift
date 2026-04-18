// ================================================================
// SanctuaryTheme.swift
// Urban Noise Sanctuary — デザイントークン & モード定義
// ================================================================

import SwiftUI

// MARK: - Hex Color Initializer
extension Color {
    /// "#0A0A0B" や "0A0A0B" から Color を生成する
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)
        self.init(
            red:   Double((value >> 16) & 0xFF) / 255,
            green: Double((value >>  8) & 0xFF) / 255,
            blue:  Double( value        & 0xFF) / 255
        )
    }
}

// MARK: - App-wide Color Tokens
extension Color {
    /// 漆黒ベース
    static let unsBg            = Color(hex: "#0A0A0B")
    static let unsBgSecondary   = Color(hex: "#0D1520")
    static let unsBgCard        = Color(hex: "#111827")
    /// テキスト
    static let unsTextPrimary   = Color(hex: "#EDF2FF")
    static let unsTextSecondary = Color(hex: "#6B93B8")
    static let unsTextMuted     = Color(hex: "#2E4A66")
}

// MARK: - Sanctuary Mode
/// 3種の音響・ビジュアルモード。選択に応じてすべての色が切り替わる。
enum SanctuaryMode: String, CaseIterable, Identifiable {
    case calm, focus, activate

    var id: String { rawValue }

    var label: String {
        switch self {
        case .calm:     return "Calm"
        case .focus:    return "Focus"
        case .activate: return "Activate"
        }
    }

    /// シールドボーダー・ノイズバー端点・ピル選択色
    var primary: Color {
        switch self {
        case .calm:     return Color(hex: "#6E8FD4")
        case .focus:    return Color(hex: "#00A8CC")
        case .activate: return Color(hex: "#00B87A")
        }
    }

    /// Sanctuary バー端点・バッジ色
    var secondary: Color {
        switch self {
        case .calm:     return Color(hex: "#92AEDE")
        case .focus:    return Color(hex: "#00C8A8")
        case .activate: return Color(hex: "#4ECFA0")
        }
    }

    /// CTAボタンのグラデーション（左上→右下）
    var ctaGradient: LinearGradient {
        let stops: [Color]
        switch self {
        case .calm:
            stops = [Color(hex: "#6080C8"), Color(hex: "#8099D4"), Color(hex: "#A0B4E0")]
        case .focus:
            stops = [Color(hex: "#00A0C0"), Color(hex: "#00B89E"), Color(hex: "#00C8A8")]
        case .activate:
            stops = [Color(hex: "#00A870"), Color(hex: "#00BC88"), Color(hex: "#4ECFA0")]
        }
        return LinearGradient(
            colors: stops,
            startPoint: UnitPoint(x: 0.1, y: 0.1),
            endPoint:   UnitPoint(x: 0.9, y: 0.9)
        )
    }
}
