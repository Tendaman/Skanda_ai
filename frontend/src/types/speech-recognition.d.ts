declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }

  var SpeechRecognition: any;
  var webkitSpeechRecognition: any;
}

export {};
