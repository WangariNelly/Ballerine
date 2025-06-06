import { useEventEmitterLogic } from '@/components/organisms/DynamicUI/StateManager/components/ActionsHandler';
import { useStateManagerContext } from '@/components/organisms/DynamicUI/StateManager/components/StateProvider';
import { useDynamicUIContext } from '@/components/organisms/DynamicUI/hooks/useDynamicUIContext';
import { useUIElementToolsLogic } from '@/components/organisms/DynamicUI/hooks/useUIStateLogic/hooks/useUIElementsStateLogic/hooks/useUIElementToolsLogic';
import { ErrorField } from '@/components/organisms/DynamicUI/rule-engines';
import { FileUploaderField } from '@/components/organisms/UIRenderer/elements/JSONForm/components/FileUploaderField';
import { useFileRepository } from '@/components/organisms/UIRenderer/elements/JSONForm/components/FileUploaderField/hooks/useFileRepository';
import { UploadFileFn } from '@/components/organisms/UIRenderer/elements/JSONForm/components/FileUploaderField/hooks/useFileUploading/types';
import { useUIElementErrors } from '@/components/organisms/UIRenderer/hooks/useUIElementErrors/useUIElementErrors';
import { useUIElementState } from '@/components/organisms/UIRenderer/hooks/useUIElementState';
import { Document, UIElement } from '@/domains/collection-flow';
import { fetchFile, uploadFile } from '@/domains/storage/storage.api';
import { collectionFlowFileStorage } from '@/pages/CollectionFlow/versions/v1/collection-flow.file-storage';
import { findDocumentSchemaByTypeAndCategory } from '@ballerine/common';
import { AnyObject, ErrorsList, RJSFInputProps } from '@ballerine/ui';
import { HTTPError } from 'ky';
import get from 'lodash/get';
import set from 'lodash/set';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DocumentValueDestinationParser } from './helpers/document-value-destination-parser';
import { serializeDocumentId } from './helpers/serialize-document-id';

export interface DocumentFieldParams {
  documentData: Partial<Document>;
  acceptFileFormats?: string;
}

export const DocumentField = (
  props: RJSFInputProps<string> & { definition: UIElement<DocumentFieldParams> } & {
    inputIndex: number | null;
  },
) => {
  const { state } = useDynamicUIContext();
  //@ts-ignore
  const { definition, formData, inputIndex, onBlur, ...restProps } = props;
  const { stateApi } = useStateManagerContext();
  const { payload } = useStateManagerContext();
  const [fieldError, setFieldError] = useState<ErrorField | null>(null);
  const { options } = definition;

  const { toggleElementLoading } = useUIElementToolsLogic(definition.name);
  const { state: elementState } = useUIElementState(definition);

  const documentDefinition = useMemo(
    () => ({
      ...definition,
      valueDestination: `document-error-${serializeDocumentId(
        //@ts-ignore
        definition.options.documentData.id,
        inputIndex,
      )}`,
    }),
    [definition, inputIndex],
  );

  const sendEvent = useEventEmitterLogic(definition);

  const getErrorKey = useCallback(
    () =>
      inputIndex === null
        ? (documentDefinition?.options?.documentData.id as string)
        : (documentDefinition.valueDestination as string),
    [documentDefinition],
  );
  const { validationErrors, warnings } = useUIElementErrors(documentDefinition, getErrorKey);
  const warningsRef = useRef(warnings);

  const { isTouched } = elementState;

  const fileId = useMemo(() => {
    if (!Array.isArray(payload.documents)) return null;

    const parser = new DocumentValueDestinationParser(definition.valueDestination!);
    const documentsPath = parser.extractRootPath();
    const documentPagePath = parser.extractPagePath();
    const documents = (get(payload, documentsPath!) as Document[]) || [];

    const document = documents.find((document: Document) => {
      //@ts-ignore
      return document?.id === serializeDocumentId(definition.options.documentData.id, inputIndex);
    });

    //@ts-ignore
    const documentPage = get(document, documentPagePath) as Document['pages'][number];
    const fileIdPath = parser.extractFileIdPath();

    //@ts-ignore
    const fileId = get(documentPage, fileIdPath) as string | null;

    return fileId;
  }, [payload, definition, inputIndex]);

  //@ts-ignore
  useFileRepository(collectionFlowFileStorage, fileId);

  useLayoutEffect(() => {
    if (!fileId) return;

    const persistedFile = collectionFlowFileStorage.getFileById(fileId);

    if (persistedFile) return;

    void fetchFile(fileId).then(file => {
      const createdFile = new File([''], file.fileNameInBucket || file.fileNameOnDisk || '', {
        type: 'text/plain',
      });

      collectionFlowFileStorage.registerFile(fileId, createdFile);
    });
  }, [fileId, toggleElementLoading]);

  //@ts-ignore
  const fileUploader: UploadFileFn = useCallback(
    async (file: File) => {
      //@ts-ignore
      const parser = new DocumentValueDestinationParser(definition.valueDestination);

      const context = stateApi.getContext();
      //@ts-ignore
      const documents = (get(context, parser.extractRootPath()) as Document[]) || [];
      const document = documents.find(
        document =>
          //@ts-ignore
          document && document.id === serializeDocumentId(options.documentData.id, inputIndex),
      );

      try {
        toggleElementLoading();
        //@ts-ignore
        const uploadResult = await uploadFile({ file });
        setFieldError(null);

        return { fileId: uploadResult.id };
      } catch (error) {
        if (error instanceof HTTPError) {
          const response = (await error.response.json()) as AnyObject;
          setFieldError({
            // @ts-ignore
            fieldId: document.id,
            message: response.message as string,
            type: 'warning',
          });

          return;
        }

        console.error('Unexpected exception', error);
        setFieldError({
          //@ts-ignore
          fieldId: document?.id,
          message: 'Failed to upload file.',
          type: 'error',
        });

        throw error;
      } finally {
        toggleElementLoading();
      }
    },
    [stateApi, options, inputIndex, definition.valueDestination, toggleElementLoading],
  );

  const handleChange = useCallback(
    (fileId: string, clear?: boolean) => {
      //@ts-ignore
      const destinationParser = new DocumentValueDestinationParser(definition.valueDestination);
      const pathToDocumentsList = destinationParser.extractRootPath();
      const pathToPage = destinationParser.extractPagePath();
      const pathToFileId = destinationParser.extractFileIdPath();
      const file = collectionFlowFileStorage.getFileById(fileId);

      const context = stateApi.getContext();
      //@ts-ignore
      const documents = (get(context, pathToDocumentsList) as Document[]) || [];

      let document = documents.find(
        document =>
          document?.id ===
          serializeDocumentId(definition.options?.documentData?.id || '', Number(inputIndex)),
      );

      if (!document) {
        document = {
          ...options.documentData,
          //@ts-ignore
          id: serializeDocumentId(options.documentData.id, inputIndex),
          propertiesSchema:
            findDocumentSchemaByTypeAndCategory(
              //@ts-ignore
              options.documentData.type,
              options.documentData.category,
            )?.propertiesSchema || undefined,
        } as Document;
        documents.push(document);
        //@ts-ignore
        set(context, pathToDocumentsList, documents);
      }

      //@ts-ignore
      const documentPage =
        //@ts-ignore
        (get(document, pathToPage) as Document['pages'][number]) ||
        //@ts-ignore
        ({} as Document['pages'][number]);

      // Assigning file properties
      if (clear) {
        set(documentPage, pathToFileId!, undefined);
      } else {
        set(documentPage, pathToFileId!, fileId);
      }

      //@ts-ignore
      set(documentPage, 'fileName', file?.name);
      set(documentPage, 'type', file?.type);

      //@ts-ignore
      set(document, pathToPage, documentPage);
      set(document, 'decision', {});

      stateApi.setContext(context);

      sendEvent('onChange');
    },
    [stateApi, options, definition, inputIndex, sendEvent],
  );

  return (
    <div className="flex flex-col gap-2">
      <FileUploaderField
        uploadFile={fileUploader}
        disabled={
          elementState.isLoading ||
          (state.isRevision && warnings.length
            ? false
            : warningsRef.current?.length
            ? false
            : restProps.disabled)
        }
        fileId={fileId}
        fileRepository={collectionFlowFileStorage}
        onBlur={onBlur as () => void}
        testId={definition.name}
        onChange={handleChange}
        acceptFileFormats={definition.options.acceptFileFormats}
      />
      {!!warnings.length && <ErrorsList errors={warnings.map(err => err.message)} />}
      {isTouched && !!validationErrors.length && (
        <ErrorsList errors={validationErrors.map(error => error.message)} />
      )}
      {fieldError && <ErrorsList errors={[fieldError.message]} />}
    </div>
  );
};
