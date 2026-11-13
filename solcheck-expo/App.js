import React, { useState, useEffect } from 'react';
import { StyleSheet, SafeAreaView, StatusBar, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useCameraPermissions } from 'expo-camera';

const HTTPS_URL = 'https://assume-olympics-connector-cotton.trycloudflare.com/';
const LOCAL_WIFI_URL = 'http://10.52.237.41:4173/';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [activeUrl, setActiveUrl] = useState(HTTPS_URL);
  const [hasError, setHasError] = useState(false);
  const [errorDesc, setErrorDesc] = useState('');
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState(1);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  const switchUrl = (newUrl) => {
    setActiveUrl(newUrl);
    setHasError(false);
    setLoading(true);
    setKey(prev => prev + 1);
  };

  const isHttps = activeUrl.startsWith('https://');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#070B14" />

      {/* Top Protocol Switcher */}
      <View style={styles.topBar}>
        <Text style={styles.brandTitle}>🚀 SOL CHECK</Text>
        <View style={styles.switchGroup}>
          <TouchableOpacity
            style={[styles.switchPill, isHttps && styles.activePill]}
            onPress={() => switchUrl(HTTPS_URL)}
          >
            <Text style={[styles.pillText, isHttps && styles.activePillText]}>🔒 Secure HTTPS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.switchPill, !isHttps && styles.activePill]}
            onPress={() => switchUrl(LOCAL_WIFI_URL)}
          >
            <Text style={[styles.pillText, !isHttps && styles.activePillText]}>📶 Local Wi-Fi</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Camera permission banner */}
      {permission && !permission.granted && (
        <View style={styles.permBanner}>
          <Text style={styles.permText}>📷 Camera access needed for rPPG contactless pulse check.</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Allow Camera</Text>
          </TouchableOpacity>
        </View>
      )}

      {!hasError ? (
        <View style={styles.webContainer}>
          <WebView
            key={key}
            source={{ uri: activeUrl }}
            style={styles.webView}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grant"
            mixedContentMode="always"
            originWhitelist={['*']}
            onPermissionRequest={(request) => {
              request.grant(request.resources);
            }}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              // If HTTPS fails, auto fallback to local Wi-Fi
              if (activeUrl === HTTPS_URL) {
                switchUrl(LOCAL_WIFI_URL);
              } else {
                setHasError(true);
                setErrorDesc(`${nativeEvent.description || 'Connection failed'} (Code: ${nativeEvent.code})`);
              }
            }}
          />
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#38bdf8" />
              <Text style={styles.loadingText}>Connecting to Sol Check Flight Deck...</Text>
              <Text style={styles.loadingSub}>🔒 Secure HTTPS Active</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.fallback}>
          <Text style={styles.fallbackTitle}>🚀 SOL CHECK - NASA FLIGHT DECK</Text>
          <Text style={styles.fallbackSub}>Connection Error</Text>
          <Text style={styles.fallbackDesc}>
            Target: {activeUrl}{"\n\n"}
            {errorDesc}{"\n\n"}
            Select connection mode:
          </Text>

          <View style={styles.buttonCol}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => switchUrl(HTTPS_URL)}>
              <Text style={styles.primaryBtnText}>🔒 Connect via Secure HTTPS (Camera Ready)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => switchUrl(LOCAL_WIFI_URL)}>
              <Text style={styles.secondaryBtnText}>📶 Connect via Local Wi-Fi (10.52.237.41)</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070B14',
  },
  topBar: {
    height: 44,
    backgroundColor: '#0b1329',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  brandTitle: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  switchGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  switchPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#070b14',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  activePill: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38bdf8',
  },
  pillText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  activePillText: {
    color: '#38bdf8',
  },
  permBanner: {
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#38bdf8',
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  permText: {
    color: '#f8fafc',
    fontSize: 11,
    flex: 1,
    marginRight: 8,
  },
  permBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  permBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  webContainer: {
    flex: 1,
    backgroundColor: '#070B14',
  },
  webView: {
    flex: 1,
    backgroundColor: '#070B14',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#070B14',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    color: '#38bdf8',
    marginTop: 14,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  loadingSub: {
    color: '#34d399',
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  fallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#070B14',
  },
  fallbackTitle: {
    color: '#38bdf8',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  fallbackSub: {
    color: '#f87171',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  fallbackDesc: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonCol: {
    gap: 12,
    width: '100%',
    maxWidth: 320,
  },
  primaryBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
  },
});
