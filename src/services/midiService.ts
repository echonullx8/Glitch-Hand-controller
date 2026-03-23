export interface MidiDevice {
  id: string;
  name: string;
}

class MidiService {
  private midiAccess: any = null;
  private outputs: Map<string, any> = new Map();
  private listeners: ((devices: MidiDevice[]) => void)[] = [];
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (!(navigator as any).requestMIDIAccess) {
      console.warn("Web MIDI API not supported in this browser.");
      return;
    }

    try {
      this.midiAccess = await (navigator as any).requestMIDIAccess();
      this.isInitialized = true;
      
      this.updateOutputs();
      
      this.midiAccess.onstatechange = () => {
        this.updateOutputs();
      };

    } catch (err) {
      console.error("Could not access MIDI devices.", err);
    }
  }

  private updateOutputs() {
    this.outputs.clear();
    if (!this.midiAccess) return;
    
    this.midiAccess.outputs.forEach((output: any) => {
      this.outputs.set(output.id, output);
    });

    const devices = this.getOutputs();
    this.listeners.forEach(callback => callback(devices));
  }

  onStateChange(callback: (devices: MidiDevice[]) => void) {
    this.listeners.push(callback);
    callback(this.getOutputs());
  }

  getOutputs(): MidiDevice[] {
    const devices: MidiDevice[] = [];
    this.outputs.forEach((output) => {
      devices.push({ id: output.id, name: output.name || 'Unknown Device' });
    });
    return devices;
  }

  sendControlChange(deviceId: string | 'all', channel: number, controller: number, value: number) {
    const statusByte = 0xB0 + (channel - 1);
    const clampedValue = Math.max(0, Math.min(127, Math.floor(value)));

    if (deviceId === 'all') {
      this.outputs.forEach(output => {
        output.send([statusByte, controller, clampedValue]);
      });
    } else {
      const output = this.outputs.get(deviceId);
      if (output) {
        output.send([statusByte, controller, clampedValue]);
      }
    }
  }
}

export const midiService = new MidiService();