// Regenerate on macOS: swift scripts/generate-dmg-background.swift
import AppKit

let width = 720
let height = 460
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
let context = NSGraphicsContext.current!.cgContext
context.translateBy(x: 0, y: CGFloat(height))
context.scaleBy(x: 1, y: -1)

func color(_ red: CGFloat, _ green: CGFloat, _ blue: CGFloat) -> NSColor {
    NSColor(srgbRed: red / 255, green: green / 255, blue: blue / 255, alpha: 1)
}
let ink = color(36, 49, 43)
let muted = color(101, 116, 107)
let accent = color(61, 115, 82)
color(245, 247, 242).setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: width, height: height)).fill()

func text(_ value: String, y: CGFloat, size: CGFloat, weight: NSFont.Weight, color: NSColor) {
    let style = NSMutableParagraphStyle()
    style.alignment = .center
    // Keep text upright inside the flipped drawing coordinates.
    context.saveGState()
    context.translateBy(x: 0, y: y + size * 1.4)
    context.scaleBy(x: 1, y: -1)
    (value as NSString).draw(in: NSRect(x: 24, y: 0, width: width - 48, height: Int(size * 1.6)),
        withAttributes: [.font: NSFont.systemFont(ofSize: size, weight: weight),
                         .foregroundColor: color, .paragraphStyle: style])
    context.restoreGState()
}
text("gitloom.", y: 34, size: 36, weight: .bold, color: ink)
text("Your next commit starts here.", y: 92, size: 15, weight: .regular, color: muted)

// Finder places the real app and Applications icons inside these soft wells.
for x in [CGFloat(180), CGFloat(540)] {
    color(233, 239, 231).setFill()
    NSBezierPath(roundedRect: NSRect(x: x - 70, y: 177, width: 140, height: 140),
                 xRadius: 28, yRadius: 28).fill()
}
accent.setStroke()
let arrow = NSBezierPath()
arrow.lineWidth = 3
arrow.lineCapStyle = .round
arrow.lineJoinStyle = .round
arrow.move(to: NSPoint(x: 301, y: 240))
arrow.line(to: NSPoint(x: 419, y: 240))
arrow.move(to: NSPoint(x: 407, y: 228))
arrow.line(to: NSPoint(x: 419, y: 240))
arrow.line(to: NSPoint(x: 407, y: 252))
arrow.stroke()
text("Drag Gitloom to Applications", y: 355, size: 19, weight: .semibold, color: ink)
text("Then open Gitloom from Applications to get started.", y: 391, size: 13, weight: .regular, color: muted)
NSGraphicsContext.restoreGraphicsState()
let destination = URL(fileURLWithPath: "src-tauri/dmg/background.png")
try bitmap.representation(using: .png, properties: [:])!.write(to: destination)
print("Generated \(destination.path)")
