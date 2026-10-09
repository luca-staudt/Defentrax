"use client";

import { Modal as RsModal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "lg",
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  return (
    <RsModal
      isOpen={isOpen}
      toggle={onClose}
      centered
      scrollable
      size={size === "md" ? undefined : size}
      backdrop="static"
      keyboard
      className="dx-modal"
      contentClassName="dx-modal-content"
    >
      <ModalHeader toggle={onClose} className="dx-modal-header">
        <span className="dx-modal-title">{title}</span>
        {subtitle ? <p className="dx-modal-subtitle mb-0">{subtitle}</p> : null}
      </ModalHeader>
      <ModalBody className="dx-modal-body">{children}</ModalBody>
      {footer ? <ModalFooter className="dx-modal-footer">{footer}</ModalFooter> : null}
    </RsModal>
  );
}
