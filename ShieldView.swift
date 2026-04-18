// ================================================================
// ShieldView.swift
// Urban Noise Sanctuary — アニメーション付きシールドコンポーネント
// ================================================================

import SwiftUI

// MARK: - Ripple Ring
/// シールドから外側へ広がり消えていくリング。3本をずらして配置する。
private struct RippleRing: View {
    let color: Color
    /// アニメーション開始を遅らせる秒数（0 / 1.2 / 2.4s）
    let delay: Double
    /// リングの直径（シールド円と同サイズからスタート）
    let size: CGFloat

    @State private var expanded = false

    var body: some View {
        Circle()
            .stroke(color, lineWidth: 1)
            .frame(width: size, height: size)
            // 1.0倍 → 1.75倍にスケール、不透明度 0.5 → 0 で消える
            .scaleEffect(expanded ? 1.75 : 1.0)
            .opacity(expanded ? 0 : 0.5)
            .task {
                // ディレイ後に無限ループアニメーション開始
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                withAnimation(.easeOut(duration: 3.6).repeatForever(autoreverses: false)) {
                    expanded = true
                }
            }
    }
}

// MARK: - Corner Bracket Shape
/// 12×12 pt のL字ブラケット（左上・右下の装飾コーナー）
private struct CornerBracket: Shape {
    enum Corner { case topLeft, bottomRight }
    let corner: Corner

    func path(in rect: CGRect) -> Path {
        var p = Path()
        switch corner {
        case .topLeft:
            // ┌ 形
            p.move(to:    CGPoint(x: rect.maxX, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        case .bottomRight:
            // ┘ 形
            p.move(to:    CGPoint(x: rect.minX, y: rect.maxY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        }
        return p
    }
}

// MARK: - Shield View
/// リップルリング3本 + グローする円 + アイコン + 波形テキスト
struct ShieldView: View {
    let mode: SanctuaryMode
    /// シールド円の直径（リップルリングはここを基準に拡大）
    let circleSize: CGFloat

    @State private var glowIntense   = false
    @State private var waveScale:   CGFloat = 0.88
    @State private var waveOpacity: Double  = 0.35

    // HTML: corner は circle の中で top/left: 26px の位置 (26/200 = 13%)
    private var bracketInset: CGFloat { circleSize * 0.13 }
    private let bracketSize:  CGFloat = 12

    var body: some View {
        ZStack {
            // ── 3本のリップルリング（シールド円の背後）
            RippleRing(color: mode.primary, delay: 0.0, size: circleSize)
            RippleRing(color: mode.primary, delay: 1.2, size: circleSize)
            RippleRing(color: mode.primary, delay: 2.4, size: circleSize)

            // ── シールド円本体
            Circle()
                .stroke(mode.primary, lineWidth: 1.5)
                .frame(width: circleSize, height: circleSize)
                // 外側グロー（4秒でパルス）
                .shadow(
                    color:  mode.primary.opacity(glowIntense ? 0.32 : 0.15),
                    radius: glowIntense ? 28 : 14
                )
                // 放射グラデーション内部フィル
                .background(
                    RadialGradient(
                        colors: [
                            mode.primary.opacity(0.10),
                            mode.primary.opacity(0.04),
                            Color.clear,
                        ],
                        center:      UnitPoint(x: 0.4, y: 0.35),
                        startRadius: 0,
                        endRadius:   circleSize * 0.5
                    )
                    .clipShape(Circle())
                )
                // 左上コーナーブラケット
                .overlay(alignment: .topLeading) {
                    CornerBracket(corner: .topLeft)
                        .stroke(mode.primary, lineWidth: 1)
                        .frame(width: bracketSize, height: bracketSize)
                        .opacity(0.35)
                        .offset(x: bracketInset, y: bracketInset)
                }
                // 右下コーナーブラケット
                .overlay(alignment: .bottomTrailing) {
                    CornerBracket(corner: .bottomRight)
                        .stroke(mode.primary, lineWidth: 1)
                        .frame(width: bracketSize, height: bracketSize)
                        .opacity(0.35)
                        .offset(x: -bracketInset, y: -bracketInset)
                }
                // 中央: ◉ アイコン + ∿ 波形テキスト
                .overlay {
                    VStack(spacing: 6) {
                        Text("◉")
                            .font(.system(size: circleSize * 0.19, weight: .ultraLight))
                            .foregroundStyle(mode.primary)
                            .shadow(color: mode.primary.opacity(0.55), radius: 8)

                        Text("∿∿∿")
                            .font(.system(size: circleSize * 0.09, weight: .ultraLight))
                            .foregroundStyle(mode.primary)
                            // 横方向にドリフト（2.4秒で往復）
                            .scaleEffect(x: waveScale, y: 1)
                            .opacity(waveOpacity)
                    }
                }
        }
        // リップルが最大 1.75× まで広がれるコンテナサイズ
        .frame(width: circleSize * 1.75, height: circleSize * 1.75)
        .onAppear {
            // シールドグロー: 4秒 ease-in-out 往復ループ
            withAnimation(.easeInOut(duration: 4).repeatForever(autoreverses: true)) {
                glowIntense = true
            }
            // 波形ドリフト: 2.4秒往復ループ
            withAnimation(.easeInOut(duration: 2.4).repeatForever(autoreverses: true)) {
                waveScale   = 1.1
                waveOpacity = 0.75
            }
        }
        // モード切替時のスムーズな色遷移
        .animation(.easeInOut(duration: 0.5), value: mode.id)
    }
}

// MARK: - Preview
#Preview {
    ZStack {
        Color.unsBg.ignoresSafeArea()
        ShieldView(mode: .focus, circleSize: 200)
    }
}
