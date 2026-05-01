import * as ImagePicker from 'expo-image-picker'
import { useEffect, useState } from 'react'
import { Alert, Button, StyleSheet, Text, View } from 'react-native'
import { PolaroidCard } from '../../components/PolaroidCard'
import { supabase } from '../../lib/supabase'

export default function HomeScreen() {
  const [memories, setMemories] = useState<any[]>([])

  useEffect(() => {
    fetchMemories()
  }, [])
  function stablePosition(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const ax = Math.abs(hash);
    return {
      x: 20 + (ax % 240),
      y: 120 + ((ax * 7) % 360),
    };
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
        fetchMemories() // refresh list
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        PinnedMemories 💖
      </Text>

      <Button title="Upload Photo 📸" onPress={pickImage} />

      <View style={styles.board}>
        {([...memories]
          .sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0))
          .map((memory, index) => {
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
                onDragStart={bringToFront}
                onDragEnd={handleDragEnd}
              />
            )
          }))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6EFE7',
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
  }
})