class TTSException(Exception):
    pass

class TTSTimeoutException(TTSException):
    pass

class TTSProviderException(TTSException):
    pass

class AudioStorageException(Exception):
    pass
