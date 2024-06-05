/**
 * Enum of the mode for connection with the host
 */
export enum EspNCPHostConnectionMode {
    NCP_HOST_CONNECTION_MODE_UART = 0x01,       /*!< NCP UART connection with the host */
    NCP_HOST_CONNECTION_MODE_SPI = 0x02,        /*!< NCP SPI connection with the host */
};

/**
 * Enum of the status
 */
export enum EspNCPStatus {
    ESP_NCP_SUCCESS = 0x00,                     /*!< The generic 'no error' */
    ESP_NCP_ERR_FATAL = 0x01,                   /*!< The generic 'fatal error' */
    ESP_NCP_BAD_ARGUMENT = 0x02,                /*!< An invalid value was passed as an argument */
    ESP_NCP_ERR_NO_MEM = 0x03,                  /*!< Out of memory */
};

/**
 * Enum of the network state
 */
export enum EspNCPStates {
    ESP_NCP_OFFLINES = 0x00,                     /*!< The network is offline */
    ESP_NCP_JOINING = 0x01,                      /*!< Joinging the network */
    ESP_NCP_CONNECTED = 0x02,                    /*!< Conneted with the network */
    ESP_NCP_LEAVING = 0x03,                      /*!< Leaving the network */
    ESP_NCP_CONFIRM = 0x04,                      /*!< Confirm the APS */
    ESP_NCP_INDICATION = 0x05,                   /*!< Indication the APS */
};

/**
 * Enum of the network security mode 
 */
export enum EspNCPSecur {
    ESP_NCP_NO_SECURITY = 0x00,                  /*!< The network is no security mode */
    ESP_NCP_PRECONFIGURED_NETWORK_KEY = 0x01,    /*!< Pre-configured the network key */
    ESP_NCP_NETWORK_KEY_FROM_TC = 0x02,
    ESP_NCP_ONLY_TCLK = 0x03,
};


/**
 * Enum of the event id for NCP.
 *
 */
// export enum EspNCPEvent {
//     NCP_EVENT_INPUT,                /*!< Input event from NCP to host */
//     NCP_EVENT_OUTPUT,               /*!< Output event from host to NCP */
//     NCP_EVENT_RESET,                /*!< Reset event from host to NCP */
//     NCP_EVENT_LOOP_STOP,            /*!< Stop loop event from host to NCP */
// } esp_ncp_event_t;


/**
 * Enum of the device type
 */
export enum EspNCPDeviceType {
    COORDINATOR = 0x00,
    ROUTER = 0x01,
    ED = 0x02,
};