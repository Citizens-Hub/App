/// <reference lib="webworker" />

import {
  PathBuilderService,
  type AutoPathBaseGraphOptions,
  type AutoPathSessionData,
  type PathGraphResult
} from '../services/PathBuilderService';

export interface PathBuilderBaseGraphPrebuildRequest {
  type: 'prebuild';
  requestId: number;
  sessionData: AutoPathSessionData;
  options: AutoPathBaseGraphOptions;
}

export interface PathBuilderBaseGraphPrebuildSuccess {
  type: 'success';
  requestId: number;
  key: string;
  graph: PathGraphResult;
}

export interface PathBuilderBaseGraphPrebuildError {
  type: 'error';
  requestId: number;
  error: string;
}

type PathBuilderBaseGraphWorkerMessage =
  | PathBuilderBaseGraphPrebuildSuccess
  | PathBuilderBaseGraphPrebuildError;

const workerScope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;
const pathBuilderService = new PathBuilderService();

workerScope.onmessage = (event: MessageEvent<PathBuilderBaseGraphPrebuildRequest>) => {
  const message = event.data;
  if (!message || message.type !== 'prebuild') {
    return;
  }

  void (async () => {
    try {
      await pathBuilderService.initializeAutoPathSession(message.sessionData, {
        warmupWasm: false
      });

      const snapshot = pathBuilderService.buildAutoPathBaseGraphSnapshot({
        options: message.options,
        data: message.sessionData
      });

      if (!snapshot) {
        const noGraphMessage: PathBuilderBaseGraphPrebuildError = {
          type: 'error',
          requestId: message.requestId,
          error: 'Failed to build auto-path base graph snapshot'
        };
        workerScope.postMessage(noGraphMessage as PathBuilderBaseGraphWorkerMessage);
        return;
      }

      const successMessage: PathBuilderBaseGraphPrebuildSuccess = {
        type: 'success',
        requestId: message.requestId,
        key: snapshot.key,
        graph: snapshot.graph
      };
      workerScope.postMessage(successMessage as PathBuilderBaseGraphWorkerMessage);
    } catch (error) {
      const errorMessage: PathBuilderBaseGraphPrebuildError = {
        type: 'error',
        requestId: message.requestId,
        error: error instanceof Error ? error.message : String(error)
      };
      workerScope.postMessage(errorMessage as PathBuilderBaseGraphWorkerMessage);
    }
  })();
};
