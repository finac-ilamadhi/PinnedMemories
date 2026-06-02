import * as ImagePicker from 'expo-image-picker'
import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { PolaroidCard } from '../../components/PolaroidCard'
import { WidgetBoard } from '../../components/WidgetBoard'
import ViewShot from 'react-native-view-shot'
import { supabase } from '../../lib/supabase'

export default function HomeScreen() {
  const [memories, setMemories] = useState<any[]>([])
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 })
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [selectedSize, setSelectedSize] = useState<'small' | 'medium' | 'large'>('large')

  const viewShotRef = useRef<any>(null)
  const smallRef = useRef<any>(null)
  const mediumRef = useRef<any>(null)
  const largeRef = useRef<any>(null)

  const snapshotTimer = useRef<NodeJS.Timeout | null>(null)
  const isSnapshotting = useRef(false)

  useEffect(() => {
    fetchMemories()
  }, [])

  // Debounced scheduler to auto-update snapshots
  function scheduleWidgetSnapshotUpdate() {
    if (snapshotTimer.current) {
      clearTimeout(snapshotTimer.current)
    }
    snapshotTimer.current = setTimeout(generateAllSnapshots, 1200)
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (snapshotTimer.current) {
        clearTimeout(snapshotTimer.current)
      }
    }
  }, [])

  // Helper to get selected widget dimensions
  const getWidgetDimensions = () => {
    switch (selectedSize) {
      case 'small':
        return { width: 180, height: 180 }
      case 'medium':
        return { width: 320, height: 180 }
      case 'large':
      default:
        return { width: 320, height: 320 }
    }
  }

  async function generateAllSnapshots() {
    if (isSnapshotting.current) {
      console.log('Snapshot generation already in progress, skipping.')
      return
    }

    isSnapshotting.current = true
    setIsCapturing(true)
    console.log('Starting automated widget snapshot generation...')

    try {
      const targets = [
        { size: 'small', ref: smallRef, col: 'snapshot_small_url' },
        { size: 'medium', ref: mediumRef, col: 'snapshot_medium_url' },
        { size: 'large', ref: largeRef, col: 'snapshot_large_url' },
      ]

      const updateFields: any = {}

      for (const target of targets) {
        if (!target.ref.current) {
          console.log(`Ref for ${target.size} not ready, skipping.`)
          continue
        }

        // Capture
        const uri = await target.ref.current.capture()
        const response = await fetch(uri)
        const blob = await response.blob()

        const fileName = `widget-${target.size}-${Date.now()}.png`
        const file = new File([blob], fileName, { type: 'image/png' })

        // Upload
        const { error: uploadError } = await supabase.storage
          .from('widget-snapshots')
          .upload(fileName, file, {
            upsert: true,
            contentType: 'image/png',
          })

        if (uploadError) {
          console.log(`Failed to upload ${target.size} snapshot:`, uploadError)
          continue
        }

        // Public URL
        const { data } = supabase.storage
          .from('widget-snapshots')
          .getPublicUrl(fileName)

        updateFields[target.col] = data.publicUrl
        console.log(`Uploaded ${target.size} snapshot to:`, data.publicUrl)
      }

      // Update DB at row id=1 if any updates succeeded
      if (Object.keys(updateFields).length > 0) {
        const { error: dbError } = await supabase
          .from('widget_state')
          .update(updateFields)
          .eq('id', 1)

        if (dbError) {
          console.log('Failed to update widget_state table:', dbError)
        } else {
          console.log('widget_state updated successfully with all 3 snapshot URLs!')
        }
      }
    } catch (err) {
      console.log('Error generating all snapshots:', err)
    } finally {
      isSnapshotting.current = false
      setIsCapturing(false)
    }
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

  async function fetchMemories() {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.log('Fetch error:', error)
    } else {
      setMemories(data || [])
    }
  }

  async function pickImage() {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (!permissionResult.granted) {
      Alert.alert('Permission required', 'Please allow access.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    })

    if (!result.canceled) {
      uploadImage(result.assets[0].uri)
    }
  }

  async function uploadImage(uri: string) {
    try {
      const response = await fetch(uri)
      const blob = await response.blob()

      const fileName = `memory-${Date.now()}.jpg`
      const file = new File([blob], fileName, { type: blob.type })

      const { error: uploadError } = await supabase.storage
        .from('pinned-photos')
        .upload(fileName, file)

      if (uploadError) {
        console.log('Upload error:', uploadError)
        return
      }

      const { data } = supabase.storage
        .from('pinned-photos')
        .getPublicUrl(fileName)

      const publicUrl = data.publicUrl

      const { error: dbError } = await supabase
        .from('memories')
        .insert([{ image_url: publicUrl }])

      if (dbError) {
        console.log('DB error:', dbError)
      } else {
        await fetchMemories() // refresh list
        scheduleWidgetSnapshotUpdate() // trigger background snapshot update
      }
    } catch (err) {
      console.log('Unexpected error:', err)
    }
  }

  async function handleDragEnd(id: string, x: number, y: number) {
    // ✅ update UI instantly
    setMemories((prev) =>
      prev.map((m) => (m.id === id ? { ...m, position_x: x, position_y: y } : m))
    )

    // ✅ then save to DB
    const { error } = await supabase
      .from('memories')
      .update({
        position_x: x,
        position_y: y,
      })
      .eq('id', id)

    if (error) {
      console.log('Position save error:', error)
    }
    scheduleWidgetSnapshotUpdate() // trigger background snapshot update
  }

  async function handleDelete(id: string) {
    // Optimistic UI update
    setMemories((prev) => prev.filter((m) => m.id !== id))
    setActiveMenuId(null)

    const { error } = await supabase.from('memories').delete().eq('id', id)
    if (error) {
      console.log('Delete error:', error)
    }
    scheduleWidgetSnapshotUpdate() // trigger background snapshot update
  }

  async function handleResize(id: string, nextScale: number) {
    // optimistic UI
    setMemories((prev) =>
      prev.map((m) => (m.id === id ? { ...m, user_scale: nextScale } : m))
    )

    const { error } = await supabase
      .from('memories')
      .update({ user_scale: nextScale })
      .eq('id', id)

    if (error) console.log('Resize save error:', error)
    scheduleWidgetSnapshotUpdate() // trigger background snapshot update
  }

  async function bringToFront(id: string) {
    const maxZ =
      memories.length > 0
        ? Math.max(...memories.map((m) => m.z_index ?? 0))
        : 0

    const newZ = maxZ + 1

    // update UI first
    setMemories((prev) =>
      prev.map((m) => (m.id === id ? { ...m, z_index: newZ } : m))
    )

    // then update DB
    const { error } = await supabase
      .from('memories')
      .update({ z_index: newZ })
      .eq('id', id)

    if (error) console.log('z_index update error:', error)
  }

  async function handleGenerateSnapshot() {
    if (!viewShotRef.current) {
      Alert.alert('Error', 'Widget Board reference not ready')
      return
    }

    setIsCapturing(true)
    try {
      // 1. Capture snapshot image
      const uri = await viewShotRef.current.capture()
      
      // 2. Fetch image content as blob
      const response = await fetch(uri)
      const blob = await response.blob()

      const fileName = `widget-${selectedSize}-${Date.now()}.png`
      const file = new File([blob], fileName, { type: 'image/png' })

      // 3. Upload to Supabase bucket 'widget-snapshots'
      const { error: uploadError } = await supabase.storage
        .from('widget-snapshots')
        .upload(fileName, file, {
          upsert: true,
          contentType: 'image/png',
        })

      if (uploadError) {
        console.log('Snapshot upload error:', uploadError)
        Alert.alert('Upload Failed', uploadError.message)
        setIsCapturing(false)
        return
      }

      // 4. Get Public URL
      const { data } = supabase.storage
        .from('widget-snapshots')
        .getPublicUrl(fileName)

      const publicUrl = data.publicUrl
      console.log('Snapshot public URL:', publicUrl)

      // 5. Update widget_state table row id=1 with snapshot_url based on size
      let updateFields: any = {}
      if (selectedSize === 'small') {
        updateFields.snapshot_small_url = publicUrl
      } else if (selectedSize === 'medium') {
        updateFields.snapshot_medium_url = publicUrl
      } else if (selectedSize === 'large') {
        updateFields.snapshot_large_url = publicUrl
      }

      const { error: dbError } = await supabase
        .from('widget_state')
        .update(updateFields)
        .eq('id', 1)

      if (dbError) {
        console.log('Database update error:', dbError)
        Alert.alert('Database Update Failed', dbError.message)
      } else {
        Alert.alert('Success', `Widget snapshot (${selectedSize}) uploaded and widget_state updated successfully!`)
      }
    } catch (err: any) {
      console.log('Snapshot generation error:', err)
      Alert.alert('Error', err.message || 'An unexpected error occurred')
    } finally {
      setIsCapturing(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.contentContainer}>
        <Text style={styles.title}>PinnedMemories 💖</Text>
        <View style={styles.actionRow}>
          <Button title="Upload Photo 📸" onPress={pickImage} disabled={isPreviewMode || isCapturing} />
          <Button
            title={isPreviewMode ? 'Normal View 🖥️' : 'Widget Preview 📱'}
            onPress={() => setIsPreviewMode(!isPreviewMode)}
            disabled={isCapturing}
          />
          {isPreviewMode && (
            <Button
              title={isCapturing ? 'Saving... ⏳' : 'Capture Snapshot 📸'}
              onPress={handleGenerateSnapshot}
              disabled={isCapturing}
            />
          )}
        </View>

        {isPreviewMode && (
          <View style={styles.sizeSelectorRow}>
            <Pressable
              style={[styles.sizeButton, selectedSize === 'small' && styles.activeSizeButton]}
              onPress={() => setSelectedSize('small')}
              disabled={isCapturing}
            >
              <Text style={[styles.sizeButtonText, selectedSize === 'small' && styles.activeSizeButtonText]}>
                Small (180x180)
              </Text>
            </Pressable>
            <Pressable
              style={[styles.sizeButton, selectedSize === 'medium' && styles.activeSizeButton]}
              onPress={() => setSelectedSize('medium')}
              disabled={isCapturing}
            >
              <Text style={[styles.sizeButtonText, selectedSize === 'medium' && styles.activeSizeButtonText]}>
                Medium (320x180)
              </Text>
            </Pressable>
            <Pressable
              style={[styles.sizeButton, selectedSize === 'large' && styles.activeSizeButton]}
              onPress={() => setSelectedSize('large')}
              disabled={isCapturing}
            >
              <Text style={[styles.sizeButtonText, selectedSize === 'large' && styles.activeSizeButtonText]}>
                Large (320x320)
              </Text>
            </Pressable>
          </View>
        )}

        {isPreviewMode ? (
          <View style={styles.previewContainer}>
            <Text style={styles.previewLabel}>
              Simulated Widget Screen ({getWidgetDimensions().width}x{getWidgetDimensions().height})
            </Text>
            <View
              style={[
                styles.wallpaperBackground,
                {
                  width: getWidgetDimensions().width,
                  height: getWidgetDimensions().height,
                },
              ]}
            >
              <ViewShot
                ref={viewShotRef}
                options={{ format: 'png', quality: 1.0 }}
              >
                <WidgetBoard
                  memories={memories}
                  width={getWidgetDimensions().width}
                  height={getWidgetDimensions().height}
                />
              </ViewShot>
            </View>
          </View>
        ) : (
          <Pressable
            style={styles.board}
            onPress={() => setActiveMenuId(null)}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout
              setBoardSize({ width, height })
            }}
          >
            <View pointerEvents="none" style={styles.support}>
              <Image
                source={require('../../assets/support/grid.png')}
                style={StyleSheet.absoluteFill}
                resizeMode="contain"
              />
            </View>

            {[...memories]
              .sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0))
              .map((memory) => {
                const { x: defaultX, y: defaultY } = stablePosition(memory.id)
                const x = memory.position_x ?? defaultX
                const y = memory.position_y ?? defaultY

                return (
                  <PolaroidCard
                    key={memory.id}
                    imageUrl={memory.image_url}
                    memoryId={memory.id}
                    x={x}
                    y={y}
                    zIndex={memory.z_index ?? 0}
                    boardWidth={boardSize.width}
                    boardHeight={boardSize.height}
                    menuOpen={activeMenuId === memory.id}
                    userScale={memory.user_scale ?? 1}
                    onResize={handleResize}
                    onLongPressMenu={() => setActiveMenuId(memory.id)}
                    onRequestDelete={handleDelete}
                    onDragStart={bringToFront}
                    onDragEnd={handleDragEnd}
                  />
                )
              })}
          </Pressable>
        )}

        {/* Hidden ViewShots for background auto snapshot generation */}
        <View style={{ position: 'absolute', left: -9999, top: -9999 }} pointerEvents="none">
          <ViewShot ref={smallRef} options={{ format: 'png', quality: 1.0 }}>
            <WidgetBoard memories={memories} width={180} height={180} />
          </ViewShot>
          <ViewShot ref={mediumRef} options={{ format: 'png', quality: 1.0 }}>
            <WidgetBoard memories={memories} width={320} height={180} />
          </ViewShot>
          <ViewShot ref={largeRef} options={{ format: 'png', quality: 1.0 }}>
            <WidgetBoard memories={memories} width={320} height={320} />
          </ViewShot>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6EFE7',
  },
  contentContainer: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
    textAlign: 'center',
  },
  board: {
    flex: 1,
    marginTop: 20,
    position: 'relative',
  },
  support: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 10,
  },
  previewContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  previewLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 16,
  },
  wallpaperBackground: {
    borderRadius: 24,
    backgroundColor: '#8BC6EC',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#4A5568',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  sizeSelectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 8,
  },
  sizeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
  },
  activeSizeButton: {
    backgroundColor: '#3182ce',
  },
  sizeButtonText: {
    fontSize: 12,
    color: '#4a5568',
    fontWeight: '600',
  },
  activeSizeButtonText: {
    color: '#ffffff',
  },
})