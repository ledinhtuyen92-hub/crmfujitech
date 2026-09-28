class PlatformError(Exception):
    pass

class CapabilityNotSupportedError(PlatformError):
    pass

class PlatformAuthError(PlatformError):
    pass

class PlatformTokenExpiredError(PlatformAuthError):
    pass

class PlatformRateLimitError(PlatformError):
    pass

class PlatformAPIError(PlatformError):
    pass
