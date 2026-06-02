import React, { useMemo } from 'react'
import {
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native'

export type MemoryItem = {
  id: string
  image_url: string
  position_x: number
  position_y: number
  rotation?: number
  z_index?: number
  user_scale?: number
  caption?: string
}

interface WidgetBoardProps {
  memories: MemoryItem[]
  width: number
  height: number
}

function generateStableStyle(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }

  const rotation = (hash % 12) - 6
  const scale = 0.97 + (Math.abs(hash) % 5) / 100

  const PIN_COLORS = ['#E85A4F', '#5DA9A6', '#F2C14E']
  const pinColor = PIN_COLORS[Math.abs(hash) % PIN_COLORS.length]

  return { rotation, scale, pinColor }
}

function stablePosition(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  const ax = Math.abs(hash)
  return {
    x: 20 + (ax % 240),
    y: 120 + ((ax * 7) % 360),
  }
}

export const WidgetBoard: React.FC<WidgetBoardProps> = ({
  memories,
  width,
  height,
}) => {
  // Sort by z_index ascending to ensure correct stacking order
  const sortedMemories = useMemo(() => {
    return [...memories].sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0))
  }, [memories])

  // Responsive styling variables
  const scaleFactor = Math.min(width, height) / 320
  const cardWidth = Math.max(120, 280 * scaleFactor)
  const cardPadding = Math.max(6, 14 * scaleFactor)
  const cardPaddingBottom = cardPadding * 2
  const cardBorderRadius = Math.max(4, 10 * scaleFactor)
  const fontSize = Math.max(8, 14 * scaleFactor)
  const spacerHeight = Math.max(4, 10 * scaleFactor)
  
  // Pin responsive sizing
  const pinSize = Math.max(10, 18 * scaleFactor)
  const pinRadius = pinSize / 2
  const pinHighlightSize = pinSize / 3
  const pinHighlightRadius = pinHighlightSize / 2
  const pinHighlightTop = pinSize * (3 / 18)
  const pinHighlightLeft = pinSize * (4 / 18)

  // Clamp function
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

  return (
    <View style={[styles.container, { width, height }]} pointerEvents="none">
      {/* Grid support overlay behind photos */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Image
          source={require('../assets/support/grid.png')}
          style={styles.gridOverlay}
          resizeMode="contain"
        />
      </View>

      {sortedMemories.map((memory) => {
        const { x: defaultX, y: defaultY } = stablePosition(memory.id)
        
        // Reference board dimensions (based on standard board container sizes ~360x600)
        const scaleX = width / 360
        const scaleY = height / 600
        
        // Scale coordinate mapping
        const x = (memory.position_x ?? defaultX) * scaleX
        const y = (memory.position_y ?? defaultY) * scaleY

        const { rotation: stableRot, scale: stableScale, pinColor } = generateStableStyle(memory.id)
        const rotation = memory.rotation ?? stableRot
        
        // ✅ Correct scale logic: stable variation multiplied by user custom scale
        const userScale = memory.user_scale ?? 1
        const finalScale = stableScale * userScale
        const zIndex = memory.z_index ?? 0

        // Clamping to keep card frames inside widget bounds
        const effectiveW = cardWidth * finalScale
        const cardHeight = cardWidth + cardPadding * 3.5 // estimated vertical size
        const effectiveH = cardHeight * finalScale
        const margin = 4
        
        const clampedX = clamp(x, margin, Math.max(margin, width - effectiveW - margin))
        const clampedY = clamp(y, margin, Math.max(margin, height - effectiveH - margin))

        const cardTransformStyle = {
          transform: [
            { translateX: clampedX },
            { translateY: clampedY },
            { rotate: `${rotation}deg` },
            { scale: finalScale },
          ],
          zIndex,
        }

        return (
          <View
            key={memory.id}
            style={[styles.polaroidContainer, cardTransformStyle]}
          >
            <View
              style={[
                styles.card,
                {
                  width: cardWidth,
                  padding: cardPadding,
                  paddingBottom: cardPaddingBottom,
                  borderRadius: cardBorderRadius,
                },
              ]}
            >
              <Image
                source={{ uri: memory.image_url }}
                style={[
                  styles.image,
                  { borderRadius: Math.max(2, 4 * scaleFactor) },
                ]}
              />

              {memory.caption ? (
                <Text style={[styles.caption, { fontSize, marginTop: cardPadding }]}>
                  {memory.caption}
                </Text>
              ) : (
                <View style={{ height: spacerHeight }} />
              )}

              {/* Pin Decoration */}
              <View style={[styles.pinContainer, { top: -pinSize / 2 }]}>
                <View
                  style={[
                    styles.pin,
                    {
                      width: pinSize,
                      height: pinSize,
                      borderRadius: pinRadius,
                      backgroundColor: pinColor,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.pinHighlight,
                      {
                        width: pinHighlightSize,
                        height: pinHighlightSize,
                        borderRadius: pinHighlightRadius,
                        top: pinHighlightTop,
                        left: pinHighlightLeft,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
  },
  polaroidContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#FFFDF9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
    position: 'relative',
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#eee',
  },
  caption: {
    color: '#333',
    textAlign: 'center',
  },
  pinContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  pin: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  pinHighlight: {
    backgroundColor: 'rgba(255,255,255,0.4)',
    position: 'absolute',
  },
})
