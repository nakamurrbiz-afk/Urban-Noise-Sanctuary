// ================================================================
// SanctuaryView.swift
// Urban Noise Sanctuary — メインスクリーン
// バッジ / ノイズバー / モードピッカー / CTAボタン を合成
// ================================================================

import SwiftUI

// MARK: - Active Badge ─────────────────────────────────────────────
/// 「Sanctuary 稼働中」と表示する点滅バッジ
private struct ActiveBadge: View {
    let mode: SanctuaryMode
    @State private var dotOpacity: Double = 1

    var body: some View {
        HStack(spacing: 7) {
            // 点滅ドット
            Circle()
                .fill(mode.secondary)
                .frame(width: 6, height: 6)
                .shadow(color: mode.secondary, radius: 3)
                .opacity(dotOpacity)

            Text("Sanctuary 稼働中")
                .font(.system(size: 12, weight: .light))
                .foregroundStyle(mode.secondary)
                .kerning(0.8)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(mode.secondary.opacity(0.07))
                .overlay(
                    Capsule().stroke(mode.secondary.opacity(0.28), lineWidth: 1)
                )
        )
        .onAppear {
            // 1.6秒で点滅（0.15 ↔ 1.0 を往復）
            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) {
                dotOpacity = 0.15
            }
        }
        .animation(.easeInOut(duration: 0.5), value: mode.id)
    }
}

// MARK: - Noise Bar Row ────────────────────────────────────────────
/// ノイズレベルを示す1行バー（アイコン + トラック + dB値）
private struct NoiseBarRow: View {
    let icon:         String
    let iconColor:    Color
    let barGradient:  LinearGradient
    let dotColor:     Color
    /// 0.0〜1.0 でバーの充填率を指定
    let fillFraction: CGFloat
    let valueText:    String
    let valueColor:   Color
    /// true のとき呼吸アニメーション（Sanctuary バー用）
    let breathes:     Bool

    @State private var breathOpacity: Double = 1

    var body: some View {
        HStack(spacing: 10) {
            // アイコン
            Text(icon)
                .font(.system(size: 14, weight: .light))
                .foregroundStyle(iconColor)
                .frame(width: 18)

            // トラック（GeometryReader でフル幅を取得してから充填幅を計算）
            GeometryReader { geo in
                let fillWidth = geo.size.width * fillFraction

                ZStack(alignment: .leading) {
                    // 背景トラック
                    Capsule()
                        .fill(Color.unsTextSecondary.opacity(0.1))
                        .frame(height: 3)

                    // グラデーション充填バー
                    Capsule()
                        .fill(barGradient)
                        .frame(width: fillWidth, height: 3)

                    // 充填末端のドット（中心を fillWidth の位置に合わせる）
                    Circle()
                        .fill(dotColor)
                        .frame(width: 7, height: 7)
                        .shadow(color: dotColor.opacity(0.6), radius: 3)
                        .offset(x: max(0, fillWidth - 3.5))
                }
                .frame(maxHeight: .infinity) // 縦方向中央揃え
            }
            .frame(height: 16)
            .opacity(breathOpacity)

            // dB 表示
            Text(valueText)
                .font(.system(size: 11, weight: .light, design: .monospaced))
                .foregroundStyle(valueColor)
                .frame(width: 38, alignment: .trailing)
        }
        .onAppear {
            guard breathes else { return }
            // 2.2秒で呼吸（1.0 ↔ 0.5 を往復）
            withAnimation(.easeInOut(duration: 2.2).repeatForever(autoreverses: true)) {
                breathOpacity = 0.5
            }
        }
    }
}

// MARK: - Noise Bars Section ───────────────────────────────────────
private struct NoiseBarsView: View {
    let mode: SanctuaryMode

    var body: some View {
        VStack(spacing: 14) {
            // 外部ノイズ（高め・静的）
            NoiseBarRow(
                icon:         "⟡",
                iconColor:    Color.unsTextSecondary,
                barGradient:  LinearGradient(
                    colors:     [Color.unsTextSecondary.opacity(0.5), mode.primary],
                    startPoint: .leading,
                    endPoint:   .trailing
                ),
                dotColor:     mode.primary,
                fillFraction: 0.74,
                valueText:    "73 dB",
                valueColor:   mode.primary,
                breathes:     false
            )

            // Sanctuary（低め・呼吸する）
            NoiseBarRow(
                icon:         "✦",
                iconColor:    mode.secondary,
                barGradient:  LinearGradient(
                    colors:     [mode.primary, mode.secondary],
                    startPoint: .leading,
                    endPoint:   .trailing
                ),
                dotColor:     mode.secondary,
                fillFraction: 0.22,
                valueText:    "18 dB",
                valueColor:   mode.secondary,
                breathes:     true
            )
        }
        .animation(.easeInOut(duration: 0.5), value: mode.id)
    }
}

// MARK: - Mode Pill ────────────────────────────────────────────────
private struct ModePill: View {
    let mode:     SanctuaryMode
    let selected: Bool
    let action:   () -> Void

    var body: some View {
        Button(action: action) {
            Text(mode.label)
                .font(.system(size: 13, weight: .light))
                .foregroundStyle(selected ? mode.primary : Color.unsTextSecondary)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity)
                .background(
                    Capsule()
                        .fill(selected ? mode.primary.opacity(0.1) : Color.clear)
                )
                .overlay(
                    Capsule()
                        .stroke(
                            selected
                                ? mode.primary
                                : Color.unsTextSecondary.opacity(0.22),
                            lineWidth: 1
                        )
                )
                .shadow(color: selected ? mode.primary.opacity(0.15) : .clear, radius: 7)
        }
        .buttonStyle(.plain)
        .animation(.easeInOut(duration: 0.3), value: selected)
    }
}

// MARK: - Mode Picker ──────────────────────────────────────────────
private struct ModePickerView: View {
    @Binding var selected: SanctuaryMode

    var body: some View {
        HStack(spacing: 8) {
            ForEach(SanctuaryMode.allCases) { mode in
                ModePill(mode: mode, selected: selected == mode) {
                    withAnimation(.easeInOut(duration: 0.4)) {
                        selected = mode
                    }
                }
            }
        }
    }
}

// MARK: - CTA Button ───────────────────────────────────────────────
private struct CTAButton: View {
    let mode:         SanctuaryMode
    @Binding var isActive: Bool

    // ボタン押下中の視覚フィードバック
    @GestureState private var isPressing = false

    var body: some View {
        Button {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) {
                isActive.toggle()
            }
        } label: {
            HStack(spacing: 8) {
                Text("✦")
                Text(isActive ? "Sanctuaryを解除する" : "Sanctuaryを展開する")
                    .kerning(0.6)
            }
            .font(.system(size: 15, weight: .regular))
            // グラデーションが明るいためテキストは暗色に
            .foregroundStyle(Color(hex: "#04141A"))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 17)
            .background(mode.ctaGradient)
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .shadow(color: mode.primary.opacity(0.18), radius: 14, y: 8)
            // 押下中は縮小 + 半透明
            .scaleEffect(isPressing ? 0.98 : 1.0)
            .opacity(isPressing ? 0.88 : 1.0)
        }
        .buttonStyle(.plain)
        // 押下状態の検出
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .updating($isPressing) { _, state, _ in state = true }
        )
        .animation(.easeInOut(duration: 0.6), value: mode.id)
    }
}

// MARK: - Main Sanctuary Screen ───────────────────────────────────
struct SanctuaryView: View {
    @State private var mode:     SanctuaryMode = .focus
    @State private var isActive: Bool          = true

    /// 左右余白
    private let hPad: CGFloat = 28

    var body: some View {
        GeometryReader { geo in
            // 画面幅の 51% = HTML の 200px / 390px に相当
            let circleSize = geo.size.width * 0.51

            ZStack {
                // ── 漆黒背景
                Color.unsBg.ignoresSafeArea()

                ScrollView(showsIndicators: false) {
                    VStack(spacing: 0) {

                        // ── シールド（リップル + グロー）
                        ShieldView(mode: mode, circleSize: circleSize)
                            .padding(.top, 16)
                            .padding(.bottom, 18)

                        // ── 稼働中バッジ（セッション中のみ表示）
                        if isActive {
                            ActiveBadge(mode: mode)
                                .padding(.bottom, 30)
                                .transition(.opacity)
                        }

                        // ── ノイズレベルバー
                        NoiseBarsView(mode: mode)
                            .padding(.horizontal, hPad)
                            .padding(.bottom, 26)

                        // ── 区切り線
                        Rectangle()
                            .fill(Color.unsTextSecondary.opacity(0.08))
                            .frame(height: 1)
                            .padding(.horizontal, hPad)
                            .padding(.bottom, 24)

                        // ── モード選択ピル
                        ModePickerView(selected: $mode)
                            .padding(.horizontal, hPad)
                            .padding(.bottom, 32)

                        // ── CTA ボタン
                        CTAButton(mode: mode, isActive: $isActive)
                            .padding(.horizontal, hPad)

                        Spacer(minLength: 40)
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

// MARK: - Preview
#Preview {
    SanctuaryView()
}
