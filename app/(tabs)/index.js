import { decode, encode } from "base-64";
import { Buffer } from "buffer";
import { useEffect, useState } from 'react';
import 'react-native-get-random-values';

if (typeof crypto === 'undefined') {
  global.crypto = require('react-native-get-random-values');
}

import * as bip39 from 'bip39';
import * as Clipboard from 'expo-clipboard';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

global.Buffer = Buffer;
if (!global.btoa) global.btoa = encode;
if (!global.atob) global.atob = decode;

const xrpl = require("xrpl");
const SERVER_URL = "wss://xrplcluster.com"; 

export default function Index() {
  const [wallet, setWallet] = useState(null);
  const [balance, setBalance] = useState("-");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAppLocked, setIsAppLocked] = useState(true);
  const [status, setStatus] = useState("Iniciando...");

  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    initApp();
  }, []);

  async function initApp() {
    try {
      const savedMnemonic = await SecureStore.getItemAsync('user_mnemonic', { keychainService: 'xrp_secure_vault' });
      if (savedMnemonic) {
        await unlockWithBiometrics(savedMnemonic);
      } else {
        setIsAppLocked(false);
      }
    } catch (e) {
      setIsAppLocked(false);
    }
  }

  async function unlockWithBiometrics(phrase) {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Acceso Biométrico' });
    if (result.success) {
      const w = xrpl.Wallet.fromMnemonic(phrase);
      setWallet(w);
      setIsAppLocked(false);
      fetchData(w);
    }
  }

  async function fetchData(activeWallet = wallet) {
    if (!activeWallet) return;
    setLoading(true);
    try {
      const client = new xrpl.Client(SERVER_URL);
      await client.connect();
      
      // Obtener Saldo
      const b = await client.getXrpBalance(activeWallet.address);
      setBalance(b);

      // Obtener Historial (Últimas 5)
      const response = await client.request({
        command: "account_tx",
        account: activeWallet.address,
        limit: 5
      });
      setHistory(response.result.transactions);

      await client.disconnect();
    } catch (e) {
      setBalance("0 (Inactiva)");
    } finally {
      setLoading(false);
    }
  }

  const copyToClipboard = async () => {
    await Clipboard.setStringAsync(wallet.address);
    Alert.alert("Copiado", "Dirección copiada al portapapeles.");
  };

  async function handleCreateWallet() {
    setLoading(true);
    try {
      const mnemonic = bip39.generateMnemonic();
      await SecureStore.setItemAsync('user_mnemonic', mnemonic, { 
        keychainService: 'xrp_secure_vault',
        accessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY 
      });
      const newWallet = xrpl.Wallet.fromMnemonic(mnemonic);
      setWallet(newWallet);
      setIsAppLocked(false);
      Alert.alert("Éxito", "Bóveda creada.");
    } catch (e) {
      Alert.alert("Error", "Revisa la seguridad de tu cel.");
    } finally {
      setLoading(false);
    }
  }

  // Componente para cada fila del historial
  const renderTx = ({ item }) => (
    <View style={styles.txItem}>
      <Text style={styles.txType}>{item.tx.TransactionType}</Text>
      <Text style={styles.txAmount}>{item.tx.Amount / 1000000} XRP</Text>
      <Text style={styles.txStatus}>{item.validated ? "Confirmado" : "Pendiente"}</Text>
    </View>
  );

  if (isAppLocked && wallet) {
    return (
      <View style={styles.lockScreen}>
        <Text style={styles.header}>XRP Secure Pro</Text>
        <Pressable style={styles.btnPrimary} onPress={() => initApp()}>
          <Text style={styles.btnText}>DESBLOQUEAR</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>XRP Secure Pro</Text>
      
      <View style={styles.card}>
        {!wallet ? (
          <Pressable style={styles.btnPrimary} onPress={handleCreateWallet}>
            <Text style={styles.btnText}>GENERAR BÓVEDA</Text>
          </Pressable>
        ) : (
          <View>
            <View style={styles.qrContainer}>
              <QRCode value={wallet.address} size={120} color="white" backgroundColor="black" />
            </View>

            <Pressable onPress={copyToClipboard} style={styles.addressBox}>
              <Text style={styles.addressText}>{wallet.address}</Text>
              <Text style={styles.copyLabel}>📋 COPIAR</Text>
            </Pressable>
            
            <Text style={styles.balance}>{balance} XRP</Text>
            <Pressable onPress={() => fetchData()} style={{alignSelf: 'center'}}>
               <Text style={{color: '#58A6FF'}}>🔄 Actualizar Saldo</Text>
            </Pressable>

            <View style={styles.divider} />
            
            <Text style={styles.sectionTitle}>ENVIAR</Text>
            <TextInput placeholder="Destino r..." placeholderTextColor="#444" style={styles.input} onChangeText={setDestination} />
            <TextInput placeholder="Monto" placeholderTextColor="#444" keyboardType="numeric" style={styles.input} onChangeText={setAmount} />
            <Pressable style={styles.btnSend} onPress={() => fetchData()}>
              <Text style={styles.btnText}>ENVIAR XRP</Text>
            </Pressable>

            <View style={styles.divider} />
            
            <Text style={styles.sectionTitle}>HISTORIAL RECIENTE</Text>
            {history.length === 0 ? (
              <Text style={styles.emptyText}>No hay transacciones aún</Text>
            ) : (
              history.map((item, index) => (
                <View key={index} style={styles.txRow}>
                  <Text style={styles.txText}>{item.tx.Account === wallet.address ? "📤 Envío" : "📥 Recibo"}</Text>
                  <Text style={styles.txXrp}>{item.tx.Amount / 1000000} XRP</Text>
                </View>
              ))
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#000', padding: 20 },
  lockScreen: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  header: { color: '#FFF', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginVertical: 30 },
  card: { backgroundColor: '#111', borderRadius: 30, padding: 20, borderWidth: 1, borderColor: '#222' },
  qrContainer: { alignItems: 'center', marginVertical: 20, padding: 15, backgroundColor: '#000', borderRadius: 20, alignSelf: 'center' },
  addressBox: { backgroundColor: '#000', padding: 12, borderRadius: 10, borderStyle: 'dashed', borderWidth: 1, borderColor: '#444' },
  addressText: { color: '#888', fontSize: 10, textAlign: 'center', fontFamily: 'monospace' },
  copyLabel: { color: '#58A6FF', fontSize: 9, textAlign: 'center', marginTop: 5, fontWeight: 'bold' },
  balance: { color: '#3FB950', fontSize: 35, fontWeight: 'bold', textAlign: 'center', marginVertical: 15 },
  sectionTitle: { color: '#FFF', fontSize: 14, fontWeight: 'bold', marginBottom: 10 },
  input: { backgroundColor: '#000', color: '#FFF', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  btnPrimary: { backgroundColor: '#0060FF', padding: 20, borderRadius: 15, alignItems: 'center' },
  btnSend: { backgroundColor: '#238636', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#FFF', fontWeight: 'bold' },
  divider: { height: 1, backgroundColor: '#222', marginVertical: 25 },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222' },
  txText: { color: '#CCC', fontSize: 12 },
  txXrp: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  emptyText: { color: '#444', textAlign: 'center', fontSize: 12, marginTop: 10 }
});